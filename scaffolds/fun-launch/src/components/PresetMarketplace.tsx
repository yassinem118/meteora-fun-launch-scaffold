import React, { useMemo, type CSSProperties } from 'react';
import { PRESETS, buildConfig, summarizeCurve, type CurveSummary, type Preset, type PresetId } from '../lib/dbc';

interface Tile {
  preset: Preset;
  summary: CurveSummary | null;
  error: string | null;
}
import { PRESET_THEME } from '../lib/theme';

interface Props {
  selectedId: PresetId;
  onSelect: (id: PresetId) => void;
}

/** Tiny SVG sparkline of the real curve (price vs. supply sold). */
const Sparkline = ({ summary, color }: { summary: CurveSummary; color: string }) => {
  const w = 140;
  const h = 40;
  const max = summary.endPrice || 1;
  const d = summary.points
    .map((p, i) => {
      const x = (p.supplyPct / 100) * w;
      const y = h - (p.priceQuote / max) * (h - 6) - 3;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={2.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

export const PresetMarketplace = ({ selectedId, onSelect }: Props) => {
  // Every tile is computed from the real DBC config, nothing is hard-coded.
  const tiles = useMemo(
    () =>
      PRESETS.map((preset): Tile => {
        try {
          return { preset, summary: summarizeCurve(buildConfig(preset.id)), error: null };
        } catch (e) {
          return { preset, summary: null, error: e instanceof Error ? e.message : 'Invalid config' };
        }
      }),
    []
  );

  return (
    <div className="fl-tiles" role="group" aria-label="Curve presets">
      {tiles.map(({ preset, summary, error }) => {
        const theme = PRESET_THEME[preset.id];
        const active = preset.id === selectedId;
        const fee = preset.antiSnipe
          ? `${preset.antiSnipe.startBps / 100}% to ${preset.feeBps / 100}%`
          : `${(preset.feeBps / 100).toFixed(2)}%`;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset.id)}
            aria-pressed={active}
            className={`fl-tile${active ? ' is-active' : ''}`}
            style={{ '--a': theme.accent } as CSSProperties}
          >
            <div className="fl-tile-top">
              <h3 className="fl-tile-title">{preset.title}</h3>
              <span className="fl-pill">{preset.tag}</span>
            </div>
            <p>{preset.description}</p>
            {summary ? (
              <div>
                <Sparkline summary={summary} color={theme.accent} />
                <div className="fl-tile-foot">
                  <span>
                    Graduates at
                    <strong>{summary.graduationQuote.toFixed(2)} SOL</strong>
                  </span>
                  <span>
                    Fee
                    <strong>{fee}</strong>
                  </span>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--danger)' }}>{error}</p>
            )}
          </button>
        );
      })}
    </div>
  );
};
