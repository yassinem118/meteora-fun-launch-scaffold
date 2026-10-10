import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';
import { CurveVisualizer } from '../components/CurveVisualizer';
import { PresetAdvisor } from '../components/PresetAdvisor';
import { PresetMarketplace } from '../components/PresetMarketplace';
import type { PresetId } from '../lib/dbc';
import { parseShareParams, type ShareParams } from '../lib/share';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

export default function Home() {
  const router = useRouter();
  const [presetId, setPresetId] = useState<PresetId>('rwa-steps');
  const [shared, setShared] = useState<ShareParams | undefined>();
  const [ready, setReady] = useState(false);

  // Restore a config from a shared link (?p=...&i=...), then render the editor.
  useEffect(() => {
    if (!router.isReady) return;
    const parsed = parseShareParams(router.query);
    if (parsed) {
      setPresetId(parsed.preset);
      setShared(parsed);
    }
    setReady(true);
  }, [router.isReady, router.query]);

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-col items-center justify-between gap-4 border-b border-slate-800 pb-6 md:flex-row">
          <div className="text-center md:text-left">
            <h1 className="mb-2 bg-gradient-to-r from-emerald-400 via-cyan-400 to-purple-500 bg-clip-text text-4xl font-extrabold text-transparent">
              Fun Launch
            </h1>
            <p className="text-slate-400">
              Launch tokens on Meteora Dynamic Bonding Curve with curve presets built for memes, utility and tokenized stocks.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/trade" className="text-sm font-semibold text-emerald-400 underline">
              Trade
            </Link>
            <WalletMultiButton />
          </div>
        </header>

        <PresetAdvisor onPick={setPresetId} />
        <PresetMarketplace selectedId={presetId} onSelect={setPresetId} />
        {ready && <CurveVisualizer key={shared ? 'shared' : 'default'} presetId={presetId} initial={shared} />}
      </div>
    </main>
  );
}
