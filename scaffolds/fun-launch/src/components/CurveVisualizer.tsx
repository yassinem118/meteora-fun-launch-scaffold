'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, type Keypair, type Transaction } from '@solana/web3.js';
import { deriveDbcPoolAddress, getTokenDecimals } from '@meteora-ag/dynamic-bonding-curve-sdk';
import {
  Area,
  AreaChart,
  CartesianGrid,
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
import { PRESET_THEME } from '../lib/theme';

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
  const theme = PRESET_THEME[presetId];
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

  const feeText = startFeePct > feePct && snipeSeconds > 0 ? `${startFeePct}% to ${feePct}%` : `${feePct}%`;

  return (
    <div className="fl-bench">
      <div className="fl-sticky">
        <section className="fl-card" aria-label="Curve preview">
          <h2 className="fl-mood">{theme.mood}</h2>
          <p className="fl-sub">
            {preset.title}: market cap as the curve sells out. This is the exact config sent on-chain ({CLUSTER}).
          </p>

          <div className="fl-chart-wrap">
            {summary ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ left: 4, right: 12, top: 10, bottom: 4 }}>
                  <defs>
                    <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme.accent} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={theme.accent} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="curveStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={theme.accent} />
                      <stop offset="100%" stopColor={theme.accent2} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#2B3556" strokeDasharray="2 6" vertical={false} />
                  <XAxis
                    dataKey="supply"
                    type="number"
                    domain={[0, 100]}
                    unit="%"
                    stroke="#9AA5C8"
                    tickLine={false}
                    label={{ value: 'Curve supply sold', position: 'insideBottom', offset: -2, fill: '#9AA5C8', fontSize: 12 }}
                  />
                  <YAxis
                    stroke="#9AA5C8"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => v.toFixed(1)}
                    width={44}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#171E36', border: '1px solid #2B3556', borderRadius: 10 }}
                    labelStyle={{ color: '#9AA5C8' }}
                    itemStyle={{ color: '#EEF1FA' }}
                    formatter={(v) => [`${Number(v).toFixed(3)} ${quote?.symbol ?? ''}`, 'Market cap']}
                    labelFormatter={(v) => `${v}% of curve supply sold`}
                  />
                  <Area
                    type="linear"
                    dataKey="marketCap"
                    stroke="url(#curveStroke)"
                    strokeWidth={3}
                    fill="url(#curveFill)"
                    dot={false}
                    activeDot={{ r: 5, fill: theme.accent2, stroke: '#0F1424', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="fl-empty" role="alert">
                {configError}
              </div>
            )}
          </div>

          {summary && (
            <div className="fl-stats">
              <div className="fl-stat">
                <span>Starts at</span>
                <strong>
                  {initialMc} {quote?.symbol}
                </strong>
              </div>
              <div className="fl-stat">
                <span>Graduates to DAMM v2 at</span>
                <strong>
                  {summary.graduationQuote.toFixed(2)} {quote?.symbol}
                </strong>
              </div>
              <div className="fl-stat">
                <span>Trading fee</span>
                <strong>{feeText}</strong>
              </div>
            </div>
          )}
        </section>
      </div>

      <div>
        <section className="fl-card">
          <h3 className="fl-group-title">Pair with</h3>
          <p className="fl-hint">The asset buyers pay with. Use a custom mint for stablecoins or tokenized stocks.</p>
          <div className="fl-seg" role="group" aria-label="Quote token">
            {(['sol', 'custom'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setQuoteMode(m)} aria-pressed={quoteMode === m}>
                {m === 'sol' ? 'SOL' : 'Custom SPL mint'}
              </button>
            ))}
          </div>
          {quoteMode === 'custom' && (
            <div className="fl-grid2">
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="fl-label" htmlFor="quote-mint">Quote mint address</label>
                <input id="quote-mint" type="text" className="fl-input" value={quoteMintInput} onChange={(e) => setQuoteMintInput(e.target.value)} />
              </div>
              <div>
                <label className="fl-label" htmlFor="quote-symbol">Symbol</label>
                <input id="quote-symbol" type="text" maxLength={10} placeholder="USDC" className="fl-input" value={quoteSymbol} onChange={(e) => setQuoteSymbol(e.target.value)} />
              </div>
              <div style={{ alignSelf: 'end' }}>
                {customQuote && <p className="fl-note" style={{ margin: 0 }}>Mint found, {customQuote.decimals} decimals.</p>}
                {quoteError && <p className="fl-note" style={{ margin: 0, color: 'var(--danger)' }}>{quoteError}</p>}
              </div>
            </div>
          )}

          <div className="fl-grid2" style={{ marginTop: 14 }}>
            <div>
              <label className="fl-label" htmlFor="init-mc">Initial market cap ({quote?.symbol ?? 'quote'})</label>
              <input id="init-mc" type="number" min={0} step="any" className="fl-input" value={initialMc} onChange={(e) => setInitialMc(Number(e.target.value))} />
            </div>
            <div>
              <label className="fl-label" htmlFor="mig-mc">Migration market cap ({quote?.symbol ?? 'quote'})</label>
              <input id="mig-mc" type="number" min={0} step="any" className="fl-input" value={migrationMc} onChange={(e) => setMigrationMc(Number(e.target.value))} />
            </div>
          </div>
        </section>

        <section className="fl-card">
          <h3 className="fl-group-title">Fees</h3>
          <p className="fl-hint">A high opening fee that decays protects thin or newly tokenized launches from snipers.</p>
          <div className="fl-grid2">
            <div>
              <label className="fl-label" htmlFor="fee">Steady fee (%)</label>
              <input id="fee" type="number" min={0.25} max={99} step="0.05" className="fl-input" value={feePct} onChange={(e) => setFeePct(Number(e.target.value))} />
            </div>
            <div>
              <label className="fl-label" htmlFor="fee-start">Opening fee (%)</label>
              <input id="fee-start" type="number" min={0.25} max={99} step="0.05" className="fl-input" value={startFeePct} onChange={(e) => setStartFeePct(Number(e.target.value))} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="fl-label" htmlFor="fee-secs">Decay time in seconds (0 turns it off)</label>
              <input id="fee-secs" type="number" min={0} max={86400} step="10" className="fl-input" value={snipeSeconds} onChange={(e) => setSnipeSeconds(Number(e.target.value))} />
            </div>
          </div>
          <p className="fl-note">
            {startFeePct > feePct && snipeSeconds > 0
              ? `Starts at ${startFeePct}% and falls to ${feePct}% in 10 steps over about ${snipeSeconds}s (slot-based).`
              : `Flat ${feePct}% fee, no decay.`}{' '}
            After graduation, liquidity moves to DAMM v2 and stays locked.
          </p>
        </section>

        <section className="fl-card">
          <h3 className="fl-group-title">Your token</h3>
          <div className="fl-grid2" style={{ marginTop: 10 }}>
            <div>
              <label className="fl-label" htmlFor="tk-name">Name</label>
              <input id="tk-name" type="text" maxLength={32} placeholder="Tokenized Apple" className="fl-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="fl-label" htmlFor="tk-sym">Symbol</label>
              <input id="tk-sym" type="text" maxLength={10} placeholder="tAAPL" className="fl-input" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="fl-label" htmlFor="tk-desc">Description (optional)</label>
              <input id="tk-desc" type="text" maxLength={120} className="fl-input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          <button type="button" onClick={handleLaunch} disabled={loading || !summary} className="fl-btn fl-btn-primary" style={{ marginTop: 16 }}>
            {loading ? step || 'Working...' : `Launch token on ${CLUSTER}`}
          </button>

          {error && (
            <p role="alert" className="fl-error">
              {error}
            </p>
          )}

          {result && (
            <div className="fl-success" role="status">
              <p><strong>Pool created on-chain.</strong></p>
              <p>
                Transaction:{' '}
                <a href={solscan('tx', result.signature)} target="_blank" rel="noreferrer">{short(result.signature)}</a>
              </p>
              <p>
                Token mint:{' '}
                <a href={solscan('token', result.mint)} target="_blank" rel="noreferrer">{short(result.mint)}</a>
              </p>
              <p>
                DBC pool:{' '}
                <a href={solscan('account', result.pool)} target="_blank" rel="noreferrer">{short(result.pool)}</a>
              </p>
              <p>
                <a href={`/trade?mint=${result.mint}`}><strong>Open the trade page for this token</strong></a>
              </p>
            </div>
          )}

          <div className="fl-share">
            <button type="button" onClick={handleShare} disabled={!summary} className="fl-btn fl-btn-ghost">
              Copy link to this config
            </button>
            {shareUrl && (
              <input readOnly value={shareUrl} aria-label="Shareable link" onFocus={(e) => e.currentTarget.select()} className="fl-input" />
            )}
          </div>
        </section>
      </div>
    </div>
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
