import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Stateless token metadata endpoint (Metaplex JSON standard).
 * The token's on-chain `uri` points here, so no storage credentials are needed.
 * NOTE: wallets and explorers can only read it once the app is deployed on a public URL.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const pick = (v: string | string[] | undefined, max: number) =>
    String(Array.isArray(v) ? v[0] : (v ?? '')).slice(0, max);

  const name = pick(req.query.n, 32);
  const symbol = pick(req.query.s, 10);
  const description = pick(req.query.d, 200);

  if (!name || !symbol) {
    return res.status(400).json({ error: 'Missing n (name) or s (symbol)' });
  }

  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).json({ name, symbol, description });
}
