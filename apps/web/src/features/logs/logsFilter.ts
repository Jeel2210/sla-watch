// Log filters as plain data (brief: "filterable by a single date or a date range"). Pure functions only,
// so every rule here is tested; the panel just renders and dispatches.
import type { LogSort, LogTab, UploadSummary } from '@sla/core';
import { AGENT_MULTI } from '@sla/core';
import type { ChecksQuery } from '../../api/client';
import { fmtDay } from '../../lib/format';
import type { LogsWindow } from '../dashboard/logsWindow';

const DAY = 86_400_000;

export interface LogFilters {
  tab: LogTab;
  mode: 'single' | 'range';
  from: string;               // YYYY-MM-DD (UTC)
  to: string;                 // YYYY-MM-DD, inclusive; ignored in single mode
  service: string;            // '' = all
  agent: string;              // '' = all, AGENT_MULTI = reported by 2+ agents
  region: string;
  sort: LogSort;
  window: LogsWindow | null;  // set by a chart click; replaces the dates and the service
}

export type Preset = 'all' | 'last1' | 'last7';

const day = (iso: string) => iso.slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** First and last UTC day of the upload: the bounds of every date filter. */
export function bounds(u: Pick<UploadSummary, 'rangeStart' | 'rangeEnd'>) {
  return { first: day(u.rangeStart), last: day(u.rangeEnd) };
}

export function defaultFilters(u: Pick<UploadSummary, 'rangeStart' | 'rangeEnd'>): LogFilters {
  const { first, last } = bounds(u);
  return { tab: 'all', mode: 'range', from: first, to: last, service: '', agent: '', region: '', sort: 'fail', window: null };
}

/** Filters → API query. Dates become [from 00:00, day after `to` 00:00) in UTC. */
export function toQuery(f: LogFilters): ChecksQuery {
  const base = { tab: f.tab, sort: f.sort, agent: f.agent || undefined, region: f.region || undefined };
  if (f.window) return { ...base, service: f.window.service, from: f.window.from, to: f.window.to };
  const lastDay = f.mode === 'single' ? f.from : f.to;
  return { ...base, service: f.service || undefined, from: `${f.from}T00:00:00.000Z`, to: `${addDays(lastDay, 1)}T00:00:00.000Z` };
}

/** Which quick-date button the current dates match (none when a window or custom dates are set). */
export function presetOf(f: LogFilters, u: Pick<UploadSummary, 'rangeStart' | 'rangeEnd'>): Preset | null {
  if (f.window) return null;
  const { first, last } = bounds(u);
  const to = f.mode === 'single' ? f.from : f.to;
  if (to !== last) return null;
  if (f.from === first) return 'all';
  if (f.from === last) return 'last1';
  if (f.from === maxDay(first, addDays(last, -6))) return 'last7';
  return null;
}

const maxDay = (a: string, b: string) => (a > b ? a : b);

/** Quick dates, relative to the upload's last day (not today: uploads are historical). */
export function applyPreset(f: LogFilters, p: Preset, u: Pick<UploadSummary, 'rangeStart' | 'rangeEnd'>): LogFilters {
  const { first, last } = bounds(u);
  const base = { ...f, window: null };
  if (p === 'last1') return { ...base, mode: 'single', from: last, to: last };
  return { ...base, mode: 'range', from: p === 'last7' ? maxDay(first, addDays(last, -6)) : first, to: last };
}

/** Opening a chart's window: that service and time span, oldest first, all tabs. */
export function withWindow(f: LogFilters, w: LogsWindow): LogFilters {
  return { ...f, window: w, tab: 'all', sort: 'old', service: w.service };
}

/** Keeps dates inside the upload and in order; a range whose end is before its start is swapped. */
export function setDates(f: LogFilters, from: string, to: string, u: Pick<UploadSummary, 'rangeStart' | 'rangeEnd'>): LogFilters {
  const { first, last } = bounds(u);
  const clamp = (d: string) => (d < first ? first : d > last ? last : d);
  let a = clamp(from || first);
  let b = clamp(to || last);
  if (b < a) [a, b] = [b, a];
  return { ...f, window: null, from: a, to: b };
}

export type ChipKey = 'window' | 'date' | 'service' | 'agent' | 'region' | 'sort';
export interface Chip { key: ChipKey; label: string }

export const SORT_LABEL: Record<LogSort, string> = { fail: 'Failures first', old: 'Oldest first', new: 'Newest first' };

/** Active filters as removable chips. `names` maps service ids to names. */
export function chips(f: LogFilters, u: Pick<UploadSummary, 'rangeStart' | 'rangeEnd'>, names: Record<string, string>): Chip[] {
  const out: Chip[] = [];
  const preset = presetOf(f, u);
  const dayLabel = (d: string) => fmtDay(`${d}T00:00:00Z`);
  if (f.window) out.push({ key: 'window', label: f.window.label });
  else if (preset !== 'all') {
    out.push({
      key: 'date',
      label: preset === 'last1' ? `Last day · ${dayLabel(f.from)}` : preset === 'last7' ? 'Last 7 days'
        : f.mode === 'single' ? dayLabel(f.from) : `${dayLabel(f.from)} – ${dayLabel(f.to)}`,
    });
  }
  if (f.service && !f.window) out.push({ key: 'service', label: names[f.service] ?? f.service });
  if (f.agent) out.push({ key: 'agent', label: f.agent === AGENT_MULTI ? 'Reported by 2+ agents' : f.agent });
  if (f.region) out.push({ key: 'region', label: f.region });
  if (f.sort !== 'fail') out.push({ key: 'sort', label: SORT_LABEL[f.sort] });
  return out;
}

/** Removing a chip resets just that filter ('all' resets every filter but the tab). */
export function unset(f: LogFilters, key: ChipKey | 'all', u: Pick<UploadSummary, 'rangeStart' | 'rangeEnd'>): LogFilters {
  const d = defaultFilters(u);
  if (key === 'all') return { ...d, tab: f.tab };
  if (key === 'window') return { ...f, window: null, service: '', from: d.from, to: d.to, mode: 'range' };
  if (key === 'date') return { ...f, window: null, from: d.from, to: d.to, mode: 'range' };
  return { ...f, [key]: d[key] };
}
