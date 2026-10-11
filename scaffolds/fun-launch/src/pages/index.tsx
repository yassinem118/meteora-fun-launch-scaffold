import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';
import { CurveVisualizer } from '../components/CurveVisualizer';
import { PresetAdvisor } from '../components/PresetAdvisor';
import { PresetMarketplace } from '../components/PresetMarketplace';
import { Shell } from '../components/Shell';
import type { PresetId } from '../lib/dbc';
import { parseShareParams, type ShareParams } from '../lib/share';

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
    <Shell presetId={presetId}>
      <section className="fl-hero">
        <h1>Launch a token on a curve you designed</h1>
        <p>
          Choose how the price climbs, how fees protect early buyers, and what the token trades against.
          When the curve sells out, the pool migrates to Meteora DAMM v2 with its liquidity locked.
        </p>
      </section>

      <section className="fl-section" aria-labelledby="pick-curve">
        <div className="fl-section-head">
          <div>
            <h2 className="fl-h2" id="pick-curve">Pick a curve</h2>
            <p className="fl-sub">Every preset is a real Meteora DBC config. The page takes on its colour.</p>
          </div>
          <PresetAdvisor onPick={setPresetId} />
        </div>
        <PresetMarketplace selectedId={presetId} onSelect={setPresetId} />
      </section>

      <section className="fl-section" aria-label="Shape and launch" style={{ paddingBottom: 60 }}>
        {ready && <CurveVisualizer key={shared ? 'shared' : 'default'} presetId={presetId} initial={shared} />}
      </section>
    </Shell>
  );
}
