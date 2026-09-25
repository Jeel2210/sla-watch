import { DEFAULT_INTERVAL_MIN, MAX_LINE_CHARS, MAX_ROWS, REQUIRED_COLUMNS } from './constants';
import { splitCsvLine } from './csv';
import { parseRow, type ParsedRow } from './row';
import type { Check, CleanIssues, CleanResult, QualityFlag, RejectedRow } from './types';

type Slotted = ParsedRow & { snapped: boolean };

const emptyIssues = (): CleanIssues => ({
  exactDuplicates: 0, epoch: 0, offset: 0, offsets: {}, unitConverted: {}, unitCase: 0, trimmed: 0,
  latencyMissing: 0, latencyNegative: 0, invalidStatus: 0, status4xx: 0, snapped: 0, mergedRows: 0,
});

function countIssues(issues: CleanIssues, r: ParsedRow): void {
  if (r.tsKind === 'epoch') issues.epoch++;
  if (r.tsKind === 'iso_offset' && r.tsOffset) {
    issues.offset++;
    issues.offsets[r.tsOffset] = (issues.offsets[r.tsOffset] ?? 0) + 1;
  }
  if (r.unit && r.unit !== 'ms') issues.unitConverted[r.unit] = (issues.unitConverted[r.unit] ?? 0) + 1;
  if (r.unitCaseFixed) issues.unitCase++;
  if (r.trimmed) issues.trimmed++;
  if (r.latencyIssue === 'missing') issues.latencyMissing++;
  if (r.latencyIssue === 'negative') issues.latencyNegative++;
  if (!r.statusValid) issues.invalidStatus++;
  else if (r.status >= 400 && r.status <= 499) issues.status4xx++;
}

/** Most common gap between distinct timestamps of the same service. */
export function detectInterval(rows: { serviceId: string; ms: number }[]): { intervalMs: number; hits: number; totalGaps: number } {
  const perService = new Map<string, Set<number>>();
  for (const r of rows) {
    let set = perService.get(r.serviceId);
    if (!set) { set = new Set(); perService.set(r.serviceId, set); }
    set.add(r.ms);
  }
  const gapCount = new Map<number, number>();
  for (const set of perService.values()) {
    const sorted = [...set].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i]! - sorted[i - 1]!;
      gapCount.set(gap, (gapCount.get(gap) ?? 0) + 1);
    }
  }
  let intervalMs = DEFAULT_INTERVAL_MIN * 60_000;
  let hits = 0;
  let totalGaps = 0;
  for (const [gap, n] of gapCount) {
    totalGaps += n;
    if (n > hits) { hits = n; intervalMs = gap; }
  }
  return { intervalMs, hits, totalGaps };
}

/** One check per service + slot: a valid failure wins, a valid status beats an invalid one. */
function mergeGroup(group: Slotted[]): Check {
  const valid = group.filter(r => r.statusValid);
  const pick = valid.find(r => r.status >= 500 && r.status <= 599) ?? valid[0] ?? group[0]!;
  const latencyMs = pick.latencyMs ?? group.find(r => r.latencyMs !== null)?.latencyMs ?? null;
  const flags = new Set<QualityFlag>();
  for (const r of group) {
    if (r.tsKind === 'epoch') flags.add('epoch_ts');
    if (r.tsKind === 'iso_offset') flags.add('offset_ts');
    if (r.unit && r.unit !== 'ms') flags.add('unit_converted');
    if (r.latencyIssue === 'missing') flags.add('latency_missing');
    if (r.latencyIssue === 'negative') flags.add('latency_negative');
    if (!r.statusValid) flags.add('invalid_status');
    if (r.snapped) flags.add('snapped');
  }
  if (group.length > 1) flags.add('merged');
  if (valid.length > 0) flags.delete('invalid_status');
  if (latencyMs !== null) { flags.delete('latency_missing'); flags.delete('latency_negative'); }
  const isValid = valid.length > 0;
  return {
    serviceId: pick.serviceId, slot: pick.ms, status: pick.status, isValid,
    isFailed: isValid && pick.status >= 500 && pick.status <= 599,
    latencyMs, agents: [...new Set(group.map(r => r.agent))].sort(), region: pick.region, flags: [...flags].sort(),
  };
}

export function cleanCsv(text: string, opts: { maxRows?: number } = {}): CleanResult {
  const maxRows = opts.maxRows ?? MAX_ROWS;
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== '');
  const header = lines[0] ? splitCsvLine(lines[0].slice(0, MAX_LINE_CHARS)).map(h => h.trim().toLowerCase()) : [];
  if (lines.length < 2) return { ok: false, code: 'EMPTY', message: 'The file has no data rows.', found: header };
  if (lines.length - 1 > maxRows) {
    return { ok: false, code: 'TOO_MANY_ROWS', message: `The file has ${lines.length - 1} data rows; the limit is ${maxRows}.`, found: header };
  }
  const missing = REQUIRED_COLUMNS.filter(c => !header.includes(c));
  if (missing.length) return { ok: false, code: 'MISSING_COLUMNS', message: 'Required columns are missing.', missing: [...missing], found: header };
  const col: Record<string, number> = {};
  header.forEach((h, i) => { if (col[h] === undefined) col[h] = i; });

  const issues = emptyIssues();
  const rejected: RejectedRow[] = [];
  const names = new Map<string, string>();
  const seen = new Set<string>();
  const parsed: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.length > MAX_LINE_CHARS) {
      rejected.push({ line: i + 1, raw: line.slice(0, 200), reason: `Line is longer than ${MAX_LINE_CHARS} characters` });
      continue;
    }
    if (seen.has(line)) { issues.exactDuplicates++; continue; }
    seen.add(line);
    const res = parseRow(splitCsvLine(line), col, header.length);
    if (!res.ok) { rejected.push({ line: i + 1, raw: line, reason: res.reason }); continue; }
    countIssues(issues, res.row);
    if (!names.has(res.row.serviceId)) names.set(res.row.serviceId, res.row.serviceName);
    parsed.push(res.row);
  }
  if (!parsed.length) return { ok: false, code: 'NO_READABLE_ROWS', message: 'No row in the file could be read.', found: header, rejected };

  const { intervalMs, hits, totalGaps } = detectInterval(parsed);
  const groups = new Map<string, Slotted[]>();
  for (const r of parsed) {
    const slot = Math.round(r.ms / intervalMs) * intervalMs;
    const snapped = slot !== r.ms;
    if (snapped) issues.snapped++;
    const key = `${r.serviceId}|${slot}`;
    const item: Slotted = { ...r, ms: slot, snapped };
    const group = groups.get(key);
    if (group) group.push(item); else groups.set(key, [item]);
  }
  const checks: Check[] = [];
  for (const group of groups.values()) {
    if (group.length > 1) issues.mergedRows += group.length - 1;
    checks.push(mergeGroup(group));
  }
  checks.sort((a, b) => a.slot - b.slot || a.serviceId.localeCompare(b.serviceId));

  let rangeStart = Infinity;
  let rangeEnd = -Infinity;
  for (const c of checks) { if (c.slot < rangeStart) rangeStart = c.slot; if (c.slot > rangeEnd) rangeEnd = c.slot; }
  const services = [...names.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id));
  const slots = Math.round((rangeEnd - rangeStart) / intervalMs) + 1;
  const expectedChecks = services.length * slots;
  const agents = new Set<string>();
  const regions = new Set<string>();
  for (const c of checks) { c.agents.forEach(a => agents.add(a)); if (c.region) regions.add(c.region); }

  return {
    ok: true, services, checks, rejected,
    intervalMin: intervalMs / 60_000, intervalHits: hits, totalGaps,
    rangeStart, rangeEnd, days: (rangeEnd - rangeStart + intervalMs) / 86_400_000,
    expectedChecks, gaps: expectedChecks - checks.length, rowsTotal: lines.length - 1,
    issues, agents: [...agents].sort(), regions: [...regions].sort(),
  };
}
