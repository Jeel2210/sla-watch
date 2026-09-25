import { INCIDENT_MAX_GAP_MIN, INCIDENT_MIN_RUN } from './constants';
import { groupByService, percentile } from './sla';
import type { CleanOk, Incident } from './types';

/** Longest run of consecutive slots in an ascending list. */
function longestRun(slots: number[], intervalMs: number): number {
  let best = slots.length ? 1 : 0;
  let run = 1;
  for (let i = 1; i < slots.length; i++) {
    run = slots[i]! - slots[i - 1]! === intervalMs ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/**
 * Failures at most `maxGapMin` apart are grouped; a group is an incident when it has
 * `minRun` or more failed checks in a row. For on-call only — never changes SLA numbers.
 */
export function detectIncidents(r: CleanOk, maxGapMin: number = INCIDENT_MAX_GAP_MIN, minRun: number = INCIDENT_MIN_RUN): Incident[] {
  const intervalMs = r.intervalMin * 60_000;
  const maxGapMs = maxGapMin * 60_000;
  const out: Incident[] = [];
  for (const [serviceId, checks] of groupByService(r.checks)) {
    const failedSlots = checks.filter(c => c.isFailed).map(c => c.slot).sort((a, b) => a - b);
    const found: Incident[] = [];
    let group: number[] = [];
    const flush = () => {
      if (group.length && longestRun(group, intervalMs) >= minRun) {
        const start = group[0]!;
        const last = group[group.length - 1]!;
        const inside = checks.filter(c => c.slot >= start && c.slot <= last && c.latencyMs !== null).map(c => c.latencyMs!).sort((a, b) => a - b);
        found.push({ serviceId, start, end: last + intervalMs, failedChecks: group.length, medianLatencyMs: percentile(inside, 0.5), normalLatencyMs: null });
      }
      group = [];
    };
    for (const slot of failedSlots) {
      const prev = group[group.length - 1];
      if (prev !== undefined && slot - prev > maxGapMs) flush();
      group.push(slot);
    }
    flush();
    const normal = checks
      .filter(c => !c.isFailed && c.latencyMs !== null && !found.some(i => c.slot >= i.start && c.slot < i.end))
      .map(c => c.latencyMs!)
      .sort((a, b) => a - b);
    const normalLatencyMs = percentile(normal, 0.5);
    for (const i of found) out.push({ ...i, normalLatencyMs });
  }
  return out.sort((a, b) => a.start - b.start || a.serviceId.localeCompare(b.serviceId));
}
