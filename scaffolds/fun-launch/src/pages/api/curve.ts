import type { NextApiRequest, NextApiResponse } from 'next';
import { TOTAL_SUPPLY, buildConfig, resolveFeeSchedule, summarizeCurve } from '../../lib/dbc';
import { parseShareParams } from '../../lib/share';

/**
 * GET /api/curve?p=<preset>&i=<initial mcap>&m=<migration mcap>&f=<fee %>&s=<start fee %>&t=<decay seconds>&d=<quote decimals>
 * Returns the exact curve (price and market cap vs. supply sold), fee schedule and graduation
 * threshold for a config. Same query format as the shareable links.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const params = parseShareParams(req.query);
  if (!params) {
    return res.status(400).json({ error: 'Missing or unknown preset. Use ?p=meme|steady|rwa-steps|flat' });
  }

  const dRaw = Array.isArray(req.query.d) ? req.query.d[0] : req.query.d;
  const decimals = dRaw === undefined ? 9 : Number(dRaw);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 12) {
    return res.status(400).json({ error: 'd (quote decimals) must be an integer between 0 and 12' });
  }

  const overrides = {
    initialMarketCap: params.initialMc,
    migrationMarketCap: params.migrationMc,
    feeBps: params.feePct !== undefined ? Math.round(params.feePct * 100) : undefined,
    antiSnipeStartBps: params.startFeePct !== undefined ? Math.round(params.startFeePct * 100) : undefined,
    antiSnipeSeconds: params.snipeSeconds,
  };

  try {
    const summary = summarizeCurve(buildConfig(params.preset, overrides, decimals), decimals);
    return res.status(200).json({
      preset: params.preset,
      quoteDecimals: decimals,
      totalSupply: TOTAL_SUPPLY,
      fee: resolveFeeSchedule(params.preset, overrides),
      graduationQuote: summary.graduationQuote,
      points: summary.points.map((p) => ({
        supplyPct: Number(p.supplyPct.toFixed(4)),
        price: p.priceQuote,
        marketCap: p.priceQuote * TOTAL_SUPPLY,
      })),
    });
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid config' });
  }
}
