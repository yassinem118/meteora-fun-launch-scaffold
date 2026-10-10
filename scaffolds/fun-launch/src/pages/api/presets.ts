import type { NextApiRequest, NextApiResponse } from 'next';
import { PRESETS, TOTAL_SUPPLY, buildConfig, resolveFeeSchedule, summarizeCurve } from '../../lib/dbc';

/**
 * GET /api/presets
 * Lists every launch preset with its computed curve, so trading terminals and other
 * launchpads can plug the configs in without re-implementing the math.
 * Prices and market caps are in units of the quote token (default: 9 decimals, i.e. SOL).
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const presets = PRESETS.map((p) => {
    const summary = summarizeCurve(buildConfig(p.id));
    return {
      id: p.id,
      title: p.title,
      tag: p.tag,
      description: p.description,
      totalSupply: TOTAL_SUPPLY,
      initialMarketCap: p.initialMarketCap,
      migrationMarketCap: p.migrationMarketCap,
      fee: resolveFeeSchedule(p.id),
      graduationQuote: summary.graduationQuote,
      curveUrl: `/api/curve?p=${p.id}`,
    };
  });

  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({ presets });
}
