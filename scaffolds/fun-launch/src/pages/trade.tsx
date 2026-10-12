import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, type Connection, type ParsedAccountData } from '@solana/web3.js';
import BN from 'bn.js';
import { Shell } from '../components/Shell';
import { explainError, sendWithPreflight } from '../lib/send';
import { KEEPER_MIN_SOL, SOL_MINT, buildMigrateTx, getMigrationStatus } from '../lib/dbc';
import {
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  DynamicBondingCurveClient,
  deriveDammV2PoolAddress,
  getCurrentPoint,
  getPriceFromSqrtPrice,
  getTokenDecimals,
  SwapMode,
  type PoolConfig,
  type VirtualPool,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

const CLUSTER = 'devnet';
const SLIPPAGE_BPS = 100;
const REFRESH_MS = 10_000;
/** Kept aside when buying with all your SOL: token account rent, wrapped SOL and fees. */
const SOL_RESERVE_LAMPORTS = 10_000_000;

interface PoolView {
  address: PublicKey;
  pool: VirtualPool;
  config: PoolConfig;
  baseDecimals: number;
  quoteDecimals: number;
  quoteMint: PublicKey;
  currentPoint: BN;
}

/** Decimal string -> BN in base units, without floating point. Returns null if invalid. */
function toUnits(value: string, decimals: number): BN | null {
  if (!/^\d*\.?\d*$/.test(value) || value === '' || value === '.') return null;
  const [int = '0', frac = ''] = value.split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const units = new BN((int || '0') + padded);
  return units.isZero() ? null : units;
}

function fromUnits(amount: BN, decimals: number, dp = 4): string {
  const s = amount.toString().padStart(decimals + 1, '0');
  const int = s.slice(0, s.length - decimals);
  if (decimals === 0) return int;
  return `${int}.${s.slice(s.length - decimals).slice(0, dp)}`;
}

/** Full-precision decimal string without trailing zeros (used by the Max button). */
function fromUnitsTrim(amount: BN, decimals: number): string {
  const full = fromUnits(amount, decimals, decimals);
  return full.includes('.') ? full.replace(/\.?0+$/, '') || '0' : full;
}

/** Sum of all token accounts the wallet holds for a mint. */
async function tokenBalance(connection: Connection, owner: PublicKey, mint: PublicKey): Promise<BN> {
  const res = await connection.getParsedTokenAccountsByOwner(owner, { mint });
  return res.value.reduce((sum, acc) => {
    const info = (acc.account.data as ParsedAccountData).parsed?.info;
    return sum.add(new BN(info?.tokenAmount?.amount ?? '0'));
  }, new BN(0));
}

export default function Trade() {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [mintInput, setMintInput] = useState('');
  const [view, setView] = useState<PoolView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [swapping, setSwapping] = useState(false);
  const [swapMsg, setSwapMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [balances, setBalances] = useState<{ base: BN; quote: BN } | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState<{ ok: boolean; text: string; dammPool?: string } | null>(null);

  const client = useMemo(() => DynamicBondingCurveClient.create(connection, 'confirmed'), [connection]);

  const load = useCallback(
    async (mintStr: string, silent = false) => {
      try {
        if (!silent) setLoading(true);
        setLoadError(null);
        const baseMint = new PublicKey(mintStr.trim());
        const found = await client.state.getPoolByBaseMint(baseMint);
        if (!found) throw new Error('No DBC pool found for this mint on ' + CLUSTER + '.');
        const config = await client.state.getPoolConfig(found.account.poolState.config);
        if (!config) throw new Error('Pool config not found.');
        const quoteDecimals = await getTokenDecimals(connection, config.quoteMint);
        const currentPoint = await getCurrentPoint(connection, config.activationType);
        setView({
          address: found.publicKey,
          pool: found.account,
          config,
          baseDecimals: config.tokenDecimal,
          quoteDecimals,
          quoteMint: config.quoteMint,
          currentPoint,
        });
      } catch (e) {
        setView(null);
        setLoadError(e instanceof Error ? e.message : 'Could not load the pool.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [client, connection]
  );

  // Load from ?mint=... and refresh periodically so progress and price stay live.
  const queryMint = typeof router.query.mint === 'string' ? router.query.mint : '';
  useEffect(() => {
    if (!queryMint) return;
    setMintInput(queryMint);
    load(queryMint);
  }, [queryMint, load]);

  useEffect(() => {
    if (!view) return undefined;
    const id = setInterval(() => load(view.pool.poolState.baseMint.toBase58(), true), REFRESH_MS);
    return () => clearInterval(id);
  }, [view, load]);

  // Wallet balances, refreshed with the pool (every REFRESH_MS) and after swaps.
  useEffect(() => {
    if (!view || !publicKey) {
      setBalances(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const [base, quote] = await Promise.all([
          tokenBalance(connection, publicKey, view.pool.poolState.baseMint),
          view.quoteMint.equals(SOL_MINT)
            ? connection.getBalance(publicKey).then((n) => new BN(n))
            : tokenBalance(connection, publicKey, view.quoteMint),
        ]);
        if (!cancelled) setBalances({ base, quote });
      } catch {
        if (!cancelled) setBalances(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, publicKey, connection]);

  // The DAMM v2 pool address is deterministic (migration config key + both mints), so it can be shown
  // for any migrated pool, not only right after pressing Migrate.
  const dammPoolAddress = useMemo(() => {
    if (!view) return null;
    try {
      const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[Number(view.config.migrationFeeOption)];
      if (!dammConfig) return null;
      return deriveDammV2PoolAddress(dammConfig, view.pool.poolState.baseMint, view.quoteMint).toBase58();
    } catch {
      return null;
    }
  }, [view]);

  const stats = useMemo(() => {
    if (!view) return null;
    const raised = new BN(view.pool.poolState.quoteReserve.toString());
    const threshold = new BN(view.config.migrationQuoteThreshold.toString());
    const pct = threshold.isZero() ? 0 : Math.min(100, raised.muln(10000).div(threshold).toNumber() / 100);
    const price = getPriceFromSqrtPrice(view.pool.poolState.sqrtPrice, view.baseDecimals, view.quoteDecimals);
    const thresholdNum = Number(threshold.toString()) / 10 ** view.quoteDecimals;
    return {
      raised: fromUnits(raised, view.quoteDecimals),
      threshold: fromUnits(threshold, view.quoteDecimals),
      pct,
      price: price.toNumber(),
      status: getMigrationStatus(view.pool, view.config),
      // Meteora's mainnet keepers skip SOL pools below this threshold, so they need a manual migration.
      belowKeeperMin: view.quoteMint.equals(SOL_MINT) && thresholdNum < KEEPER_MIN_SOL,
    };
  }, [view]);

  const inDecimals = view ? (side === 'buy' ? view.quoteDecimals : view.baseDecimals) : 0;
  const outDecimals = view ? (side === 'buy' ? view.baseDecimals : view.quoteDecimals) : 0;

  // Local quote using the SDK's own swap math (same code path as the program).
  const quote = useMemo(() => {
    if (!view) return null;
    const amountIn = toUnits(amount, inDecimals);
    if (!amountIn) return null;
    try {
      const base = {
        virtualPool: view.pool,
        config: view.config,
        swapBaseForQuote: side === 'sell',
        slippageBps: SLIPPAGE_BPS,
        hasReferral: false,
        eligibleForFirstSwapWithMinFee: false,
        currentPoint: view.currentPoint,
        amountIn,
      };
      // Buys use PartialFill so a final buy that crosses the threshold fills what it can and refunds the rest.
      const q =
        side === 'buy'
          ? client.pool.swapQuote2({ ...base, swapMode: SwapMode.PartialFill })
          : client.pool.swapQuote2({ ...base, swapMode: SwapMode.ExactIn });
      return { amountIn, out: q.outputAmount, min: q.minimumAmountOut, left: q.amountLeft, error: null as string | null };
    } catch (e) {
      return { amountIn, out: null, min: null, left: null, error: e instanceof Error ? e.message : 'Quote failed' };
    }
  }, [view, amount, side, inDecimals, client]);

  const handleSwap = async () => {
    setSwapMsg(null);
    if (!publicKey || !view || !quote || !quote.min) return;
    try {
      setSwapping(true);
      const common = {
        owner: publicKey,
        pool: view.address,
        amountIn: quote.amountIn,
        minimumAmountOut: quote.min,
        swapBaseForQuote: side === 'sell',
        referralTokenAccount: null as PublicKey | null,
        payer: publicKey,
      };
      const tx =
        side === 'buy'
          ? await client.pool.swap2({ ...common, swapMode: SwapMode.PartialFill })
          : await client.pool.swap2({ ...common, swapMode: SwapMode.ExactIn });
      const signature = await sendWithPreflight({ connection, wallet: publicKey, tx, signers: [], sendTransaction });
      setSwapMsg({ ok: true, text: `Swap confirmed: ${signature}` });
      setAmount('');
      await load(view.pool.poolState.baseMint.toBase58(), true);
    } catch (e) {
      console.error('Swap error:', e);
      setSwapMsg({ ok: false, text: explainError(e) });
    } finally {
      setSwapping(false);
    }
  };

  const handleMax = () => {
    setSwapMsg(null);
    if (!view || !balances) return;
    let raw = side === 'sell' ? balances.base : balances.quote;
    if (side === 'buy' && view.quoteMint.equals(SOL_MINT)) {
      raw = BN.max(raw.sub(new BN(SOL_RESERVE_LAMPORTS)), new BN(0));
    }
    if (raw.isZero()) {
      setSwapMsg({ ok: false, text: side === 'sell' ? 'You hold none of this token.' : 'Not enough balance to buy.' });
      return;
    }
    setAmount(fromUnitsTrim(raw, inDecimals));
  };

  const handleMigrate = async () => {
    setMigrateMsg(null);
    if (!publicKey || !view) return;
    try {
      setMigrating(true);
      const m = await buildMigrateTx({
        connection,
        wallet: publicKey,
        pool: view.address,
        config: view.config,
        baseMint: view.pool.poolState.baseMint,
      });
      const signature = await sendWithPreflight({
        connection,
        wallet: publicKey,
        tx: m.transaction,
        signers: m.signers,
        sendTransaction,
      });
      setMigrateMsg({ ok: true, text: `Migrated to DAMM v2. Transaction: ${signature}`, dammPool: m.dammPool.toBase58() });
      await load(view.pool.poolState.baseMint.toBase58(), true);
    } catch (e) {
      console.error('Migration error:', e);
      setMigrateMsg({ ok: false, text: explainError(e) });
    } finally {
      setMigrating(false);
    }
  };

  return (
    <Shell presetId="steady" narrow>
      <section className="fl-hero" style={{ paddingBottom: 12 }}>
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 40px)' }}>Trade a launched token</h1>
        <p>
          Paste the token mint to see how close it is to graduating, then buy or sell along its curve.{' '}
          <Link href="/">Launch a new one</Link>
        </p>
      </section>

      <div className="fl-advisor" style={{ width: '100%', marginBottom: 14 }}>
        <input
          type="text"
          placeholder="Token mint address"
          aria-label="Token mint address"
          value={mintInput}
          onChange={(e) => setMintInput(e.target.value)}
          className="fl-input"
        />
        <button type="button" onClick={() => load(mintInput)} disabled={loading || !mintInput.trim()} className="fl-btn fl-btn-small">
          {loading ? 'Loading...' : 'Load'}
        </button>
      </div>

      {loadError && (
        <p role="alert" className="fl-error">
          {loadError}
        </p>
      )}

      {view && stats && (
        <>
          <section className="fl-card" aria-label="Graduation progress">
            <div className="fl-row">
              <h2 className="fl-group-title" style={{ margin: 0 }}>Progress to graduation</h2>
              <span className="fl-big">{stats.pct.toFixed(1)}%</span>
            </div>
            <div className="fl-progress" role="progressbar" aria-valuenow={Math.round(stats.pct)} aria-valuemin={0} aria-valuemax={100} style={{ marginTop: 10 }}>
              <div style={{ width: `${stats.pct}%` }} />
            </div>
            <p className="fl-note">
              {stats.raised} of {stats.threshold} raised. At 100% the curve is complete and the pool can migrate to DAMM v2. Meteora's mainnet keepers only migrate pools with a threshold of at least {KEEPER_MIN_SOL} SOL (or 750 USDC); smaller pools, and everything on devnet, are migrated manually.
            </p>
            <p className="fl-note">Current price: {stats.price.toExponential(4)} per token, in quote units.</p>
            {stats.status === 'migrated' && (
              <p className="fl-success">
                This pool has graduated. Trading continues on its DAMM v2 pool.
                {dammPoolAddress && (
                  <>
                    <br />
                    <a href={`https://solscan.io/account/${dammPoolAddress}?cluster=${CLUSTER}`} target="_blank" rel="noreferrer">
                      View the DAMM v2 pool on Solscan
                    </a>
                  </>
                )}
              </p>
            )}
                    </section>

          {(stats.status === 'ready' || stats.status === 'needs-locker') && (
            <section className="fl-card" aria-label="Migration">
              <h2 className="fl-group-title">The curve is complete</h2>
              <p className="fl-hint">
                Trading on the bonding curve has ended. Migrating moves the liquidity into a Meteora DAMM v2 pool.
                Anyone can trigger it, and your wallet pays the network fee.
                {stats.belowKeeperMin && ` This pool is below the ${KEEPER_MIN_SOL} SOL keeper minimum, so it will not migrate on its own.`}
              </p>
              {stats.status === 'needs-locker' ? (
                <p className="fl-error">
                  This pool uses the Jupiter-lock variant, which needs a createLocker step before migrating. Use{' '}
                  <a href="https://migrator.meteora.ag/" target="_blank" rel="noreferrer">Meteora's manual migrator</a>.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleMigrate}
                  disabled={!publicKey || migrating}
                  className="fl-btn fl-btn-primary"
                >
                  {!publicKey ? 'Connect a wallet to migrate' : migrating ? 'Waiting for wallet...' : 'Migrate to DAMM v2'}
                </button>
              )}
              {migrateMsg && (
                <p role={migrateMsg.ok ? 'status' : 'alert'} className={migrateMsg.ok ? 'fl-success' : 'fl-error'} style={{ wordBreak: 'break-all' }}>
                  {migrateMsg.text}
                  {migrateMsg.dammPool && (
                    <>
                      <br />
                      <a href={`https://solscan.io/account/${migrateMsg.dammPool}?cluster=${CLUSTER}`} target="_blank" rel="noreferrer">
                        View the DAMM v2 pool on Solscan
                      </a>
                    </>
                  )}
                </p>
              )}
            </section>
          )}

          {stats.status === 'bonding' && (
            <section className="fl-card" aria-label="Swap">
              <div className="fl-seg" role="group" aria-label="Side" style={{ display: 'flex' }}>
                {(['buy', 'sell'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    style={{ flex: 1, textTransform: 'capitalize' }}
                    onClick={() => {
                      setSide(s);
                      setAmount('');
                    }}
                    aria-pressed={side === s}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="fl-row" style={{ marginBottom: 5 }}>
                <label className="fl-label" htmlFor="swap-amount" style={{ margin: 0 }}>
                  Amount to {side === 'buy' ? 'spend (quote token)' : 'sell (token)'}
                </label>
                {balances && (
                  <span className="fl-note" style={{ margin: 0 }}>
                    Balance: {fromUnits(side === 'sell' ? balances.base : balances.quote, inDecimals, 4)}
                  </span>
                )}
              </div>
              <div className="fl-advisor" style={{ width: '100%' }}>
                <input
                  id="swap-amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="fl-input"
                />
                <button type="button" onClick={handleMax} disabled={!publicKey || !balances} className="fl-btn fl-btn-ghost">
                  Max
                </button>
              </div>

              {quote?.out && quote.min && (
                <p className="fl-note">
                  You receive about {fromUnits(new BN(quote.out.toString()), outDecimals)}, at least{' '}
                  {fromUnits(new BN(quote.min.toString()), outDecimals)} with {SLIPPAGE_BPS / 100}% slippage.
                </p>
              )}
              {quote?.left && !quote.left.isZero() && (
                <p className="fl-note">
                  This buy completes the curve. About {fromUnits(new BN(quote.left.toString()), inDecimals)} of your amount is not used.
                </p>
              )}
              {quote?.error && <p className="fl-note" style={{ color: 'var(--danger)' }}>{quote.error}</p>}

              <button
                type="button"
                onClick={handleSwap}
                disabled={!publicKey || !quote?.min || swapping}
                className="fl-btn fl-btn-primary"
                style={{ marginTop: 16 }}
              >
                {!publicKey ? 'Connect a wallet to trade' : swapping ? 'Waiting for wallet...' : side === 'buy' ? 'Buy' : 'Sell'}
              </button>

              {swapMsg && (
                <p role={swapMsg.ok ? 'status' : 'alert'} className={swapMsg.ok ? 'fl-success' : 'fl-error'} style={{ wordBreak: 'break-all' }}>
                  {swapMsg.text}
                </p>
              )}
            </section>
          )}
        </>
      )}
    </Shell>
  );
 }