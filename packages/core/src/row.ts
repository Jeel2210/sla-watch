import { LATENCY_UNITS, MAX_ID_CHARS, MAX_LABEL_CHARS } from './constants';
import { parseTimestamp, type TsKind } from './timestamp';

export interface ParsedRow {
  serviceId: string;
  serviceName: string;
  ms: number;
  tsKind: TsKind;
  tsOffset: string | null;
  status: number;
  statusValid: boolean;
  latencyMs: number | null;
  latencyIssue: 'missing' | 'negative' | null;
  unit: string | null;          // lower-case unit, only when a latency value is present
  unitCaseFixed: boolean;
  agent: string;
  region: string | null;
  trimmed: boolean;
}
export type RowResult = { ok: true; row: ParsedRow } | { ok: false; reason: string };

export function parseRow(fields: string[], col: Record<string, number>, columnCount: number): RowResult {
  if (fields.length < columnCount) return { ok: false, reason: `Only ${fields.length} of ${columnCount} columns` };
  const get = (name: string): string => {
    const i = col[name];
    return i === undefined ? '' : (fields[i] ?? '').trim();
  };
  const trimmed = fields.some(f => f !== f.trim());

  const serviceId = get('service_id');
  if (!serviceId) return { ok: false, reason: 'Empty service_id' };
  const caps: [string, number][] = [['service_id', MAX_ID_CHARS], ['service_name', MAX_ID_CHARS], ['agent', MAX_LABEL_CHARS], ['region', MAX_LABEL_CHARS]];
  for (const [name, max] of caps) {
    if (get(name).length > max) return { ok: false, reason: `${name} is longer than ${max} characters` };
  }

  const tsText = get('timestamp');
  const ts = parseTimestamp(tsText);
  if (!ts) return { ok: false, reason: `Unrecognised timestamp "${tsText}"` };

  const latText = get('latency');
  const unitRaw = get('latency_unit');
  const unitLower = unitRaw.toLowerCase();
  let latencyMs: number | null = null;
  let latencyIssue: ParsedRow['latencyIssue'] = null;
  let unit: string | null = null;
  let unitCaseFixed = false;
  if (latText === '') {
    latencyIssue = 'missing';
  } else {
    const factor = LATENCY_UNITS[unitLower];
    if (factor === undefined) return { ok: false, reason: `Unknown latency unit "${unitRaw}"` };
    const value = Number(latText) * factor;
    if (Number.isNaN(value)) return { ok: false, reason: `Latency is not a number "${latText}"` };
    unit = unitLower;
    unitCaseFixed = unitLower !== unitRaw;
    if (value < 0) latencyIssue = 'negative';
    else latencyMs = Math.round(value);
  }

  const statusText = get('status_code');
  const parsedStatus = Number(statusText);
  const status = statusText !== '' && Number.isFinite(parsedStatus) ? parsedStatus : -1;
  const statusValid = Number.isInteger(status) && status >= 100 && status <= 599;

  return { ok: true, row: {
    serviceId, serviceName: get('service_name'), ms: ts.ms, tsKind: ts.kind, tsOffset: ts.offset,
    status, statusValid, latencyMs, latencyIssue, unit, unitCaseFixed,
    agent: get('agent') || 'unknown', region: get('region') || null, trimmed,
  } };
}
