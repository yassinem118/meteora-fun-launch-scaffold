import React, { useMemo } from 'react';
import { PRESETS, buildConfig, summarizeCurve, type CurveSummary, type PresetId } from '../lib/dbc';

interface Props {
  selectedId: PresetId;
  onSelect: (id: PresetId) => void;
}

/** Tiny SVG sparkline of the REAL curve (price vs. supply sold). */
const Sparkline = ({ summary }: { summary: CurveSummary }) => {
  const w = 120;
  const h = 36;
  const max = summary.endPrice || 1;
  const d = summary.points
    .map((p, i) => {
      const x = (p.supplyPct / 100) * w;
      const y = h - (p.priceQuote / max) * (h - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} fill="none" stroke="#34d399" strokeWidth={2} />
    </svg>
  );
};

export const PresetMarketplace = ({ selectedId, onSelect }: Props) => {
  // Every card is computed from the real DBC config, nothing is hard-coded.
  const cards = useMemo(
    () =>
      PRESETS.map((preset) => {
        try {
          return { preset, summary: summarizeCurve(buildConfig(preset.id)), error: null };
        } catch (e) {
          return { preset, summary: null, error: e instanceof Error ? e.message : 'Invalid config' };
        }
      }),
    []
  );

  return (
    <section>
      <h2 className="mb-1 text-xl font-bold text-white">Curve presets</h2>
      <p className="mb-4 text-sm text-slate-400">
        Each preset is a real Meteora DBC config built with the SDK. Pick one, then fine-tune it
        below.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ preset, summary, error }) => {
          const active = preset.id === selectedId;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelect(preset.id)}
              aria-pressed={active}
              className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                active
                  ? 'border-emerald-400 bg-emerald-500/10'
                  : 'border-slate-800 bg-slate-900 hover:border-emerald-500/50'
              }`}
            >
              <div>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-bold text-emerald-300">{preset.title}</h3>
                  <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                    {preset.tag}
                  </span>
                </div>
                <p className="mb-3 text-xs leading-relaxed text-slate-400">{preset.description}</p>
              </div>

              {summary ? (
                <div>
                  <Sparkline summary={summary} />
                  <div className="mt-2 flex justify-between border-t border-slate-800 pt-2 text-xs text-slate-300">
                    <span>
                      Graduates at <strong>{summary.graduationQuote.toFixed(2)} SOL</strong>
                    </span>
                    <span>
                      Fee <strong>{(preset.feeBps / 100).toFixed(2)}%</strong>
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-red-400">{error}</p>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
};
