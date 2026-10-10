import React, { useState } from 'react';
import { PRESETS, getPreset, type PresetId } from '../lib/dbc';

/**
 * Deterministic, rule-based preset recommender (no LLM, no randomness).
 * Each rule maps keywords in the project description to one preset.
 */
const RULES: { id: PresetId; why: string; keywords: string[] }[] = [
  {
    id: 'rwa-steps',
    why: 'Thinly traded or newly tokenized assets benefit from price discovery in bands.',
    keywords: ['stock', 'equity', 'rwa', 'real estate', 'asset', 'bond', 'commodity', 'gold', 'xstock', 'tokenized', 'share', 'etf'],
  },
  {
    id: 'meme',
    why: 'Hype-driven launches fit a curve where most supply sells cheaply and the end is steep.',
    keywords: ['meme', 'hype', 'viral', 'pump', 'degen', 'community', 'dog', 'cat', 'frog'],
  },
  {
    id: 'flat',
    why: 'Utility tokens with a target price work best with liquidity concentrated near the start price.',
    keywords: ['stable', 'pegged', 'fixed price', 'utility', 'membership', 'ticket', 'pass', 'subscription', 'credit'],
  },
  {
    id: 'steady',
    why: 'Even liquidity gives smooth, predictable price discovery for long-term projects.',
    keywords: ['dao', 'fund', 'long-term', 'long term', 'ai', 'infrastructure', 'protocol', 'game', 'gaming'],
  },
];

export function recommendPreset(text: string): { id: PresetId; reason: string; matched: string[] } {
  const t = text.toLowerCase();
  let best = { id: 'steady' as PresetId, reason: 'No strong signal, so the balanced default is suggested.', matched: [] as string[] };
  let bestScore = 0;
  for (const rule of RULES) {
    const matched = rule.keywords.filter((k) => t.includes(k));
    if (matched.length > bestScore) {
      bestScore = matched.length;
      best = { id: rule.id, reason: rule.why, matched };
    }
  }
  return best;
}

export const PresetAdvisor = ({ onPick }: { onPick: (id: PresetId) => void }) => {
  const [text, setText] = useState('');
  const [rec, setRec] = useState<ReturnType<typeof recommendPreset> | null>(null);

  const run = () => {
    if (!text.trim()) return;
    const r = recommendPreset(text);
    setRec(r);
    onPick(r.id);
  };

  return (
    <section className="rounded-xl border border-purple-500/30 bg-slate-900 p-5">
      <h2 className="mb-1 text-lg font-bold text-purple-300">Preset advisor</h2>
      <p className="mb-3 text-xs text-slate-400">
        Describe your token. A transparent rule set (shown below) picks one of the {PRESETS.length} presets.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder='e.g. "tokenized stock for a thinly traded company"'
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={run}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500"
        >
          Suggest
        </button>
      </div>
      {rec && (
        <p className="mt-3 rounded border border-purple-500/30 bg-purple-950/40 p-3 text-xs text-purple-200">
          Suggested: <strong>{getPreset(rec.id).title}</strong>. {rec.reason}
          {rec.matched.length > 0 && <> Matched keywords: {rec.matched.join(', ')}.</>}
        </p>
      )}
    </section>
  );
};
