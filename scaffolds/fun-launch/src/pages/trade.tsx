import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Shell } from '../components/Shell';
import {
  DynamicBondingCurveClient,
  getCurrentPoint,
  getPriceFromSqrtPrice,
  getTokenDecimals,
  type PoolConfig,
  type VirtualPool,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

const CLUSTER = 'devnet';
const SLIPPAGE_BPS = 100;
const REFRESH_MS = 10_000;

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
    if (!view) return;
    const id = setInterval(() => load(view.pool.poolState.baseMint.toBase58(), true), REFRESH_MS);
    return () => clearInterval(id);
  }, [view, load]);

  const stats = useMemo(() => {
    if (!view) return null;
    const raised = new BN(view.pool.poolState.quoteReserve.toString());
    const threshold = new BN(view.config.migrationQuoteThreshold.toString());
    const pct = threshold.isZero() ? 0 : Math.min(100, raised.muln(10000).div(threshold).toNumber() / 100);
    const price = getPriceFromSqrtPrice(view.pool.poolState.sqrtPrice, view.baseDecimals, view.quoteDecimals);
    return {
      raised: fromUnits(raised, view.quoteDecimals),
      threshold: fromUnits(threshold, view.quoteDecimals),
      pct,
      price: price.toNumber(),
      migrated: Number(view.pool.poolState.isMigrated) > 0,
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
      const q = client.pool.swapQuote({
        virtualPool: view.pool,
        config: view.config,
        swapBaseForQuote: side === 'sell',
        amountIn,
        slippageBps: SLIPPAGE_BPS,
        hasReferral: false,
        eligibleForFirstSwapWithMinFee: false,
        currentPoint: view.currentPoint,
      });
      return { amountIn, out: q.outputAmount, min: q.minimumAmountOut, error: null as string | null };
    } catch (e) {
      return { amountIn, out: null, min: null, error: e instanceof Error ? e.message : 'Quote failed' };
    }
  }, [view, amount, side, inDecimals, client]);

  const handleSwap = async () => {
    setSwapMsg(null);
    if (!publicKey || !view || !quote || !quote.min) return;
    try {
      setSwapping(true);
      const tx = await client.pool.swap({
        owner: publicKey,
        pool: view.address,
        amountIn: quote.amountIn,
        minimumAmountOut: quote.min,
        swapBaseForQuote: side === 'sell',
        referralTokenAccount: null,
        payer: publicKey,
      });
      const signature = await sendTransaction(tx, connection);
      const latest = await connection.getLatestBlockhash('confirmed');
      const status = await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
      if (status.value.err) throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
      setSwapMsg({ ok: true, text: `Swap confirmed: ${signature}` });
      setAmount('');
      await load(view.pool.poolState.baseMint.toBase58(), true);
    } catch (e) {
      console.error('Swap error:', e);
      setSwapMsg({ ok: false, text: e instanceof Error ? e.message : 'Swap failed.' });
    } finally {
      setSwapping(false);
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
              {stats.raised} of {stats.threshold} raised. At 100% the pool moves to DAMM v2.
            </p>
            <p className="fl-note">Current price: {stats.price.toExponential(4)} per token, in quote units.</p>
            {stats.migrated && (
              <p className="fl-success">This pool has graduated. Trading continues on its DAMM v2 pool.</p>
            )}
          </section>

          {!stats.migrated && (
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

              <label className="fl-label" htmlFor="swap-amount">
                Amount to {side === 'buy' ? 'spend (quote token)' : 'sell (token)'}
              </label>
              <input
                id="swap-amount"
                type="text"
                inputMode="decimal"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="fl-input"
              />

              {quote?.out && quote.min && (
                <p className="fl-note">
                  You receive about {fromUnits(new BN(quote.out.toString()), outDecimals)}, at least{' '}
                  {fromUnits(new BN(quote.min.toString()), outDecimals)} with {SLIPPAGE_BPS / 100}% slippage.
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
