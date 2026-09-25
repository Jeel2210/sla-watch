export type TsKind = 'iso_utc' | 'iso_offset' | 'epoch';
export interface ParsedTs { ms: number; kind: TsKind; offset: string | null }

// A timezone is required: a timestamp without Z or ±hh:mm is ambiguous, so it is rejected.
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/;

export function parseTimestamp(raw: string): ParsedTs | null {
  const t = raw.trim();
  if (/^\d{10}$/.test(t)) return { ms: Number(t) * 1000, kind: 'epoch', offset: null };
  if (/^\d{13}$/.test(t)) return { ms: Number(t), kind: 'epoch', offset: null };
  const m = ISO.exec(t);
  if (!m) return null;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  const zone = m[3] ?? 'Z';
  return zone === 'Z' ? { ms, kind: 'iso_utc', offset: null } : { ms, kind: 'iso_offset', offset: zone };
}
