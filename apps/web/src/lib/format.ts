// Display formatting, used by every screen. Times are UTC everywhere (RULES.md → Data rules).
import type { IsoTime } from '@sla/core';

type When = IsoTime | number;
const toDate = (t: When) => new Date(t);

export const nf = (n: number) => n.toLocaleString('en-US');

/** 43.2 → "43.2 min", 135 → "2 h 15 min", 120 → "2 h". */
export function fmtMin(minutes: number): string {
  const m = Math.round(minutes * 10) / 10;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** 97.15277 → "97.15%"; null (no valid checks) → "—". */
export const fmtPct = (n: number | null, digits = 2) => (n === null ? '—' : `${n.toFixed(digits)}%`);

export const fmtMs = (n: number | null) => (n === null ? '—' : `${nf(Math.round(n))} ms`);

/** "6 Apr" */
export const fmtDay = (t: When) => toDate(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
/** "6 Apr 2025" */
export const fmtDayYear = (t: When) => toDate(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** "04:15" */
export const fmtTime = (t: When) => toDate(t).toISOString().slice(11, 16);
/** "6 Apr, 04:15" */
export const fmtWhen = (t: When) => `${fmtDay(t)}, ${fmtTime(t)}`;
/** "2025-04-06 04:15" — the logs' time column. */
export const fmtStamp = (t: When) => toDate(t).toISOString().slice(0, 16).replace('T', ' ');
/** "6 Apr – 5 May 2025", or "28 Dec 2024 – 3 Jan 2025" across years. */
export function fmtRange(a: When, b: When): string {
  const sameYear = toDate(a).getUTCFullYear() === toDate(b).getUTCFullYear();
  return `${sameYear ? fmtDay(a) : fmtDayYear(a)} – ${fmtDayYear(b)}`;
}

export const fmtMB = (bytes: number) => `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 2 : 1)} MB`;

/** Downtime compared with what the SLA allows: "within allowance", "over allowance", "28× allowance". */
export function allowanceText(met: boolean | null, timesAllowance: number): string {
  if (met !== false) return 'within allowance';
  return timesAllowance >= 1.95 ? `${Math.round(timesAllowance)}× allowance` : 'over allowance';
}

export const plural = (n: number, one: string, many = `${one}s`) => `${nf(n)} ${n === 1 ? one : many}`;
