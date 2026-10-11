import React, { useState } from 'react';
import { getPreset, type PresetId } from '../lib/dbc';

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
    <div>
      <div className="fl-advisor">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="e.g. tokenized stock"
          aria-label="Describe your token"
          className="fl-input"
        />
        <button type="button" onClick={run} className="fl-btn fl-btn-small">
          Suggest
        </button>
      </div>
      {rec && (
        <p className="fl-advice" role="status">
          Suggested: <strong>{getPreset(rec.id).title}</strong>. {rec.reason}
          {rec.matched.length > 0 && <> Matched: {rec.matched.join(', ')}.</>}
        </p>
      )}
    </div>
  );
};
