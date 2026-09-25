import { HttpError } from './http';

/** Integer query parameter within [min, max]; missing → `fallback`; anything else → 400. */
export function intParam(value: string | undefined, name: string, opts: { fallback: number; min: number; max: number }): number {
  if (value === undefined || value === '') return opts.fallback;
  if (!/^-?\d+$/.test(value)) throw new HttpError(400, `${name} must be a whole number`);
  const n = Number(value);
  if (n < opts.min || n > opts.max) throw new HttpError(400, `${name} must be between ${opts.min} and ${opts.max}`);
  return n;
}

/** Optional text parameter, trimmed, capped in length; empty → undefined. */
export function textParam(value: string | undefined, name: string, maxLength = 200): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (v.length > maxLength) throw new HttpError(400, `${name} is longer than ${maxLength} characters`);
  return v;
}

/** Escapes `%`, `_` and `\` so user text is matched literally by ILIKE. */
export const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

/** Cursors are opaque to the client: base64url of a JSON array of the keyset values. */
export function encodeCursor(values: readonly (string | number)[]): string {
  return Buffer.from(JSON.stringify(values)).toString('base64url');
}

export function decodeCursor(cursor: string | undefined, arity: number): (string | number)[] | undefined {
  if (!cursor) return undefined;
  try {
    const values: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(values) && values.length === arity && values.every(v => typeof v === 'string' || typeof v === 'number')) {
      return values as (string | number)[];
    }
  } catch { /* fall through to the 400 */ }
  throw new HttpError(400, 'cursor is not valid');
}

/** `x-file-name` header → basename only, ≤ 200 chars (SECURITY.md → Input validation). */
export function fileNameParam(value: string | undefined): string {
  const base = (value ?? '').split(/[\\/]/).pop()?.trim().slice(0, 200);
  return base || 'upload.csv';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Path id → the value, or 404 (an id that cannot exist is simply not found; never reaches SQL). */
export function uuidParam(value: string | undefined, what: string): string {
  if (!value || !UUID.test(value)) throw new HttpError(404, `${what} not found`);
  return value;
}

/**
 * ISO 8601 date (UTC midnight) or date-time with a zone (Z or ±hh:mm) → normalised ISO string; anything else → 400.
 * A date-time without a zone is refused: it would be read in the server's local time.
 */
export function isoParam(value: string | undefined, name: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  const ms = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/.test(value) ? Date.parse(value) : NaN;
  if (Number.isNaN(ms)) throw new HttpError(400, `${name} must be an ISO date or date-time`);
  return new Date(ms).toISOString();
}

/** One of a fixed set of values; missing → `fallback`; anything else → 400. */
export function enumParam<T extends string>(value: string | undefined, name: string, allowed: readonly T[], fallback: T): T {
  if (value === undefined || value === '') return fallback;
  if (!(allowed as readonly string[]).includes(value)) throw new HttpError(400, `${name} must be one of: ${allowed.join(', ')}`);
  return value as T;
}
