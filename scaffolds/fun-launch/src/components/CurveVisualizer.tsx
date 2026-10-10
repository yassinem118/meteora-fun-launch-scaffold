'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, type Keypair, type Transaction } from '@solana/web3.js';
import { deriveDbcPoolAddress, getTokenDecimals } from '@meteora-ag/dynamic-bonding-curve-sdk';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  SOL_QUOTE,
  TOTAL_SUPPLY,
  buildConfig,
  buildConfigTx,
  buildPoolTx,
  getPreset,
  summarizeCurve,
  type PresetId,
  type QuoteToken,
} from '../lib/dbc';
import { buildShareQuery, type ShareParams } from '../lib/share';

const CLUSTER = 'devnet';
const solscan = (kind: 'tx' | 'token' | 'account', id: string) =>
  `https://solscan.io/${kind}/${id}?cluster=${CLUSTER}`;

interface LaunchResult {
  signature: string;
  mint: string;
  pool: string;
}

export const CurveVisualizer = ({
  presetId,
  initial,
}: {
  presetId: PresetId;
  /** Values restored from a shared link (only applied on mount). */
  initial?: ShareParams;
}) => {
  const preset = getPreset(presetId);
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  // Tunable parameters (re-initialised from the preset each time it changes).
  const [initialMc, setInitialMc] = useState(initial?.initialMc ?? preset.initialMarketCap);
  const [migrationMc, setMigrationMc] = useState(initial?.migrationMc ?? preset.migrationMarketCap);
  const [feePct, setFeePct] = useState(initial?.feePct ?? preset.feeBps / 100);
  // Anti-sniper decay: fee starts at startFeePct and falls to feePct over snipeSeconds.
  const [startFeePct, setStartFeePct] = useState(
    initial?.startFeePct ?? (preset.antiSnipe ? preset.antiSnipe.startBps / 100 : preset.feeBps / 100)
  );
  const [snipeSeconds, setSnipeSeconds] = useState(initial?.snipeSeconds ?? preset.antiSnipe?.seconds ?? 0);
  const [syncedPreset, setSyncedPreset] = useState<PresetId>(presetId);
  if (syncedPreset !== presetId) {
    setSyncedPreset(presetId);
    setInitialMc(preset.initialMarketCap);
    setMigrationMc(preset.migrationMarketCap);
    setFeePct(preset.feeBps / 100);
    setStartFeePct(preset.antiSnipe ? preset.antiSnipe.startBps / 100 : preset.feeBps / 100);
    setSnipeSeconds(preset.antiSnipe?.seconds ?? 0);
  }

  // Quote token: SOL by default, or any SPL mint (stablecoin / tokenized stock).
  const [quoteMode, setQuoteMode] = useState<'sol' | 'custom'>(initial?.quoteMint ? 'custom' : 'sol');
  const [quoteMintInput, setQuoteMintInput] = useState(initial?.quoteMint ?? '');
  const [quoteSymbol, setQuoteSymbol] = useState(initial?.quoteSymbol ?? '');
  const [customQuote, setCustomQuote] = useState<QuoteToken | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  useEffect(() => {
    if (quoteMode !== 'custom') return;
    setCustomQuote(null);
    setQuoteError(null);
    if (!quoteMintInput.trim()) return;
    let cancelled = false;
    (async () => {
      try {
        const mint = new PublicKey(quoteMintInput.trim());
        const decimals = await getTokenDecimals(connection, mint);
        if (!cancelled) setCustomQuote({ mint, decimals, symbol: quoteSymbol.trim() || 'QUOTE' });
      } catch {
        if (!cancelled) setQuoteError('Could not read this mint on the current cluster.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quoteMode, quoteMintInput, quoteSymbol, connection]);

  const quote: QuoteToken | null = quoteMode === 'sol' ? SOL_QUOTE : customQuote;

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LaunchResult | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const overrides = useMemo(
    () => ({
      initialMarketCap: initialMc,
      migrationMarketCap: migrationMc,
      feeBps: Math.round(feePct * 100),
      antiSnipeStartBps: Math.round(startFeePct * 100),
      antiSnipeSeconds: snipeSeconds,
    }),
    [initialMc, migrationMc, feePct, startFeePct, snipeSeconds]
  );

  // The chart is computed from the exact config that will be sent on-chain.
  const { summary, configError } = useMemo(() => {
    try {
      if (!(initialMc > 0) || !(migrationMc > initialMc)) {
        throw new Error('Migration market cap must be greater than the initial market cap.');
      }
      if (!(feePct >= 0.25 && feePct <= 99)) {
        throw new Error('Fee must be between 0.25% and 99%.');
      }
      if (!(startFeePct >= 0.25 && startFeePct <= 99) || !(snipeSeconds >= 0 && snipeSeconds <= 86400)) {
        throw new Error('Anti-sniper start fee must be 0.25%-99% and its duration 0-86400 seconds.');
      }
      if (!quote) throw new Error('Enter a valid quote token mint to preview the curve.');
      return {
        summary: summarizeCurve(buildConfig(presetId, overrides, quote.decimals), quote.decimals),
        configError: null,
      };
    } catch (e) {
      return { summary: null, configError: e instanceof Error ? e.message : 'Invalid config' };
    }
  }, [presetId, overrides, initialMc, migrationMc, feePct, startFeePct, snipeSeconds, quote]);

  const chartData = useMemo(
    () =>
      summary
        ? summary.points.map((p) => ({
            supply: Number(p.supplyPct.toFixed(2)),
            marketCap: p.priceQuote * TOTAL_SUPPLY,
          }))
        : [],
    [summary]
  );

  const sendAndConfirm = async (tx: Transaction, signers: Keypair[]): Promise<string> => {
    const signature = await sendTransaction(tx, connection, { signers });
    const latest = await connection.getLatestBlockhash('confirmed');
    const status = await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
    if (status.value.err) throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
    return signature;
  };

  const handleShare = async () => {
    const query = buildShareQuery({
      preset: presetId,
      initialMc,
      migrationMc,
      feePct,
      startFeePct,
      snipeSeconds,
      quoteMint: quoteMode === 'custom' ? quoteMintInput.trim() : undefined,
      quoteSymbol: quoteMode === 'custom' ? quoteSymbol.trim() : undefined,
    });
    const url = `${window.location.origin}/?${query}`;
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard may be blocked; the URL is shown below anyway */
    }
  };

  const handleLaunch = async () => {
    setError(null);
    setResult(null);
    if (!publicKey) return setError('Connect your wallet first.');
    if (!name.trim() || !symbol.trim()) return setError('Enter a token name and symbol.');
    if (configError || !quote) return setError(configError ?? 'Quote token is not ready.');

    try {
      setLoading(true);
      const uri = buildMetadataUri(name.trim(), symbol.trim(), description.trim());

      // Step 1/2: config (curve, fees, migration settings).
      setStep('Step 1/2: approve the config transaction in your wallet...');
      const cfg = await buildConfigTx({ connection, wallet: publicKey, presetId, overrides, quote });
      await sendAndConfirm(cfg.transaction, cfg.signers);

      // Step 2/2: token mint + pool (needs the config to exist on-chain).
      setStep('Step 2/2: approve the pool transaction in your wallet...');
      const launch = await buildPoolTx({
        connection,
        wallet: publicKey,
        config: cfg.config,
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        uri,
      });
      const signature = await sendAndConfirm(launch.transaction, launch.signers);

      const pool = deriveDbcPoolAddress(quote.mint, launch.baseMint, cfg.config);
      setResult({ signature, mint: launch.baseMint.toBase58(), pool: pool.toBase58() });
    } catch (e) {
      console.error('DBC launch error:', e);
      setError(e instanceof Error ? e.message : 'The launch transaction failed.');
    } finally {
      setLoading(false);
      setStep('');
    }
  };

  const input =
    'w-full rounded border border-slate-700 bg-slate-800 p-2 text-sm text-white focus:border-emerald-500 focus:outline-none';
  const label = 'mb-1 block text-xs font-medium text-slate-400';

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-emerald-400">{preset.title}: curve &amp; launch</h2>
          <p className="text-sm text-slate-400">
            Chart computed from the same DBC config that is sent on-chain ({CLUSTER}).
          </p>
        </div>
        {summary && (
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            Graduates to DAMM v2 at {summary.graduationQuote.toFixed(2)} {quote?.symbol} raised
          </span>
        )}
      </div>

      <div className="mb-6 h-72 w-full rounded-lg border border-slate-800 bg-slate-950/50 p-4">
        {summary ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="supply"
                type="number"
                domain={[0, 100]}
                unit="%"
                stroke="#94a3b8"
                label={{ value: 'Curve supply sold', position: 'insideBottom', offset: -4, fill: '#94a3b8', fontSize: 11 }}
              />
              <YAxis
                stroke="#94a3b8"
                tickFormatter={(v: number) => v.toFixed(1)}
                label={{ value: `Market cap (${quote?.symbol ?? ''})`, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                formatter={(v) => [`${Number(v).toFixed(3)} ${quote?.symbol ?? ''}`, 'Market cap']}
                labelFormatter={(v) => `${v}% of curve supply sold`}
              />
              <Line type="linear" dataKey="marketCap" stroke="#10b981" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-red-400">{configError}</div>
        )}
      </div>

      <div className="mb-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <label className={label}>Quote token (what the token is paired against)</label>
        <div className="mb-2 flex gap-2">
          {(['sol', 'custom'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setQuoteMode(m)}
              aria-pressed={quoteMode === m}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                quoteMode === m
                  ? 'border-emerald-400 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-700 text-slate-300 hover:border-emerald-500/50'
              }`}
            >
              {m === 'sol' ? 'SOL' : 'Custom SPL mint (USDC, xStock...)'}
            </button>
          ))}
        </div>
        {quoteMode === 'custom' && (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <input
              type="text"
              placeholder="Quote mint address"
              value={quoteMintInput}
              onChange={(e) => setQuoteMintInput(e.target.value)}
              className={`${input} md:col-span-2`}
            />
            <input
              type="text"
              maxLength={10}
              placeholder="Symbol (e.g. USDC)"
              value={quoteSymbol}
              onChange={(e) => setQuoteSymbol(e.target.value)}
              className={input}
            />
            {customQuote && (
              <p className="text-xs text-emerald-300 md:col-span-3">
                Mint found: {customQuote.decimals} decimals.
              </p>
            )}
            {quoteError && <p className="text-xs text-red-400 md:col-span-3">{quoteError}</p>}
          </div>
        )}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label className={label}>Initial market cap ({quote?.symbol ?? 'quote'})</label>
          <input type="number" min={0} step="any" value={initialMc} onChange={(e) => setInitialMc(Number(e.target.value))} className={input} />
        </div>
        <div>
          <label className={label}>Migration market cap ({quote?.symbol ?? 'quote'})</label>
          <input type="number" min={0} step="any" value={migrationMc} onChange={(e) => setMigrationMc(Number(e.target.value))} className={input} />
        </div>
        <div>
          <label className={label}>Trading fee (%)</label>
          <input type="number" min={0.25} max={99} step="0.05" value={feePct} onChange={(e) => setFeePct(Number(e.target.value))} className={input} />
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <p className="mb-2 text-xs font-medium text-slate-400">
          Anti-sniper fee decay (protects thin or newly tokenized launches)
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={label}>Starting fee (%)</label>
            <input type="number" min={0.25} max={99} step="0.05" value={startFeePct} onChange={(e) => setStartFeePct(Number(e.target.value))} className={input} />
          </div>
          <div>
            <label className={label}>Decay duration (seconds, 0 = off)</label>
            <input type="number" min={0} max={86400} step="10" value={snipeSeconds} onChange={(e) => setSnipeSeconds(Number(e.target.value))} className={input} />
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {startFeePct > feePct && snipeSeconds > 0
            ? `Fee starts at ${startFeePct}% and decays linearly to ${feePct}% over about ${snipeSeconds}s (slot-based, 10 steps).`
            : `Flat ${feePct}% fee (no decay).`}{' '}
          After graduation, liquidity migrates to DAMM v2 and is permanently locked.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={label}>Token name</label>
          <input type="text" maxLength={32} placeholder="e.g. Tokenized Apple" value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Token symbol</label>
          <input type="text" maxLength={10} placeholder="e.g. tAAPL" value={symbol} onChange={(e) => setSymbol(e.target.value)} className={input} />
        </div>
        <div className="md:col-span-2">
          <label className={label}>Description (optional)</label>
          <input type="text" maxLength={120} value={description} onChange={(e) => setDescription(e.target.value)} className={input} />
        </div>
      </div>

      <button
        type="button"
        onClick={handleLaunch}
        disabled={loading || !summary}
        className="w-full rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 py-3 font-bold text-slate-950 transition-all hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-50"
      >
        {loading ? step || 'Working...' : `Launch on Meteora DBC (${CLUSTER})`}
      </button>

      <div className="mt-3">
        <button
          type="button"
          onClick={handleShare}
          disabled={!summary}
          className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-emerald-500/50 disabled:opacity-50"
        >
          Copy shareable link to this config
        </button>
        {shareUrl && (
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs text-slate-300"
          />
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-4 space-y-1 rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
          <p className="font-semibold">Pool created on-chain.</p>
          <p>
            Transaction:{' '}
            <a className="underline" href={solscan('tx', result.signature)} target="_blank" rel="noreferrer">
              {short(result.signature)}
            </a>
          </p>
          <p>
            Token mint:{' '}
            <a className="underline" href={solscan('token', result.mint)} target="_blank" rel="noreferrer">
              {short(result.mint)}
            </a>
          </p>
          <p>
            <a className="font-semibold underline" href={`/trade?mint=${result.mint}`}>
              Open the trade page for this token
            </a>
          </p>
          <p>
            DBC pool:{' '}
            <a className="underline" href={solscan('account', result.pool)} target="_blank" rel="noreferrer">
              {short(result.pool)}
            </a>
          </p>
        </div>
      )}
    </section>
  );
};

const short = (s: string) => `${s.slice(0, 6)}...${s.slice(-6)}`;

/** Metaplex `uri` is capped at 200 chars, so the description is trimmed to fit. */
function buildMetadataUri(name: string, symbol: string, description: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  let desc = description;
  let uri = '';
  do {
    uri = `${origin}/api/metadata?n=${encodeURIComponent(name)}&s=${encodeURIComponent(symbol)}&d=${encodeURIComponent(desc)}`;
    desc = desc.slice(0, Math.max(0, desc.length - 10));
  } while (uri.length > 200 && desc.length > 0);
  return uri.length > 200 ? uri.replace(/&d=.*$/, '') : uri;
}
