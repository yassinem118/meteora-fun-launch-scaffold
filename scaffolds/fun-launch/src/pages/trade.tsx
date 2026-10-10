import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import {
  DynamicBondingCurveClient,
  getCurrentPoint,
  getPriceFromSqrtPrice,
  getTokenDecimals,
  type PoolConfig,
  type VirtualPool,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

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

  const input =
    'w-full rounded border border-slate-700 bg-slate-800 p-2 text-sm text-white focus:border-emerald-500 focus:outline-none';

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <Link href="/" className="text-sm text-emerald-400 underline">
            Back to launcher
          </Link>
          <WalletMultiButton />
        </header>

        <h1 className="text-2xl font-bold text-emerald-400">Trade a DBC token</h1>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Token mint address"
            value={mintInput}
            onChange={(e) => setMintInput(e.target.value)}
            className={input}
          />
          <button
            type="button"
            onClick={() => load(mintInput)}
            disabled={loading || !mintInput.trim()}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load'}
          </button>
        </div>

        {loadError && (
          <p role="alert" className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {loadError}
          </p>
        )}

        {view && stats && (
          <>
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-semibold text-slate-200">Graduation progress</h2>
                <span className="text-sm text-emerald-300">{stats.pct.toFixed(2)}%</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500" style={{ width: `${stats.pct}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {stats.raised} of {stats.threshold} raised. At 100% the pool migrates to DAMM v2.
              </p>
              <p className="mt-1 text-xs text-slate-400">Current price: {stats.price.toExponential(4)} per token (in quote units)</p>
              {stats.migrated && (
                <p className="mt-2 rounded border border-purple-500/30 bg-purple-500/10 p-2 text-xs text-purple-200">
                  This pool has graduated. Trading continues on its DAMM v2 pool.
                </p>
              )}
            </section>

            {!stats.migrated && (
              <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <div className="mb-3 flex gap-2">
                  {(['buy', 'sell'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSide(s);
                        setAmount('');
                      }}
                      aria-pressed={side === s}
                      className={`flex-1 rounded-lg border py-2 text-sm font-semibold capitalize ${
                        side === s
                          ? 'border-emerald-400 bg-emerald-500/10 text-emerald-300'
                          : 'border-slate-700 text-slate-300'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <label className="mb-1 block text-xs text-slate-400">
                  Amount in ({side === 'buy' ? 'quote token' : 'token'})
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={input}
                />

                {quote?.out && quote.min && (
                  <p className="mt-3 text-xs text-slate-300">
                    You receive about {fromUnits(new BN(quote.out.toString()), outDecimals)} (minimum{' '}
                    {fromUnits(new BN(quote.min.toString()), outDecimals)} at {SLIPPAGE_BPS / 100}% slippage)
                  </p>
                )}
                {quote?.error && <p className="mt-3 text-xs text-red-400">{quote.error}</p>}

                <button
                  type="button"
                  onClick={handleSwap}
                  disabled={!publicKey || !quote?.min || swapping}
                  className="mt-4 w-full rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 py-3 font-bold text-slate-950 disabled:opacity-50"
                >
                  {!publicKey ? 'Connect wallet' : swapping ? 'Waiting for wallet...' : side === 'buy' ? 'Buy' : 'Sell'}
                </button>

                {swapMsg && (
                  <p
                    role={swapMsg.ok ? 'status' : 'alert'}
                    className={`mt-3 break-all rounded border p-3 text-xs ${
                      swapMsg.ok
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                        : 'border-red-500/30 bg-red-500/10 text-red-300'
                    }`}
                  >
                    {swapMsg.text}
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
