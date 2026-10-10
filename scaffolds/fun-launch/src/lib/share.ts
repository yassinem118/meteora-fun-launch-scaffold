import { PRESETS, type PresetId } from './dbc';

/** Everything needed to reproduce a launch config from a URL (no backend). */
export interface ShareParams {
  preset: PresetId;
  initialMc?: number;
  migrationMc?: number;
  feePct?: number;
  startFeePct?: number;
  snipeSeconds?: number;
  quoteMint?: string;
  quoteSymbol?: string;
}

const num = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

export function buildShareQuery(p: ShareParams): string {
  const q = new URLSearchParams({ p: p.preset });
  if (p.initialMc !== undefined) q.set('i', String(p.initialMc));
  if (p.migrationMc !== undefined) q.set('m', String(p.migrationMc));
  if (p.feePct !== undefined) q.set('f', String(p.feePct));
  if (p.startFeePct !== undefined) q.set('s', String(p.startFeePct));
  if (p.snipeSeconds !== undefined) q.set('t', String(p.snipeSeconds));
  if (p.quoteMint) q.set('q', p.quoteMint);
  if (p.quoteSymbol) q.set('qs', p.quoteSymbol.slice(0, 10));
  return q.toString();
}

/** Parses and validates query params; unknown or invalid values are ignored. */
export function parseShareParams(
  query: Record<string, string | string[] | undefined>
): ShareParams | null {
  const get = (k: string) => (Array.isArray(query[k]) ? query[k]?.[0] : (query[k] as string | undefined));
  const preset = PRESETS.find((x) => x.id === get('p'))?.id;
  if (!preset) return null;
  const mint = get('q');
  return {
    preset,
    initialMc: num(get('i'), 1e-9, 1e12),
    migrationMc: num(get('m'), 1e-9, 1e12),
    feePct: num(get('f'), 0.25, 99),
    startFeePct: num(get('s'), 0.25, 99),
    snipeSeconds: num(get('t'), 0, 86400),
    quoteMint: mint && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint) ? mint : undefined,
    quoteSymbol: get('qs')?.slice(0, 10),
  };
}
