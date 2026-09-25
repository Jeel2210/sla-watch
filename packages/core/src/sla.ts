import { SLA_TARGET } from './constants';
import type { Check, CleanOk, ServiceStat } from './types';

/** Nearest-rank percentile of an ascending array: element at floor(q × (n − 1)). */
export function percentile(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.floor(q * (sorted.length - 1))] ?? null;
}

export function groupByService(checks: Check[]): Map<string, Check[]> {
  const by = new Map<string, Check[]>();
  for (const c of checks) {
    const list = by.get(c.serviceId);
    if (list) list.push(c); else by.set(c.serviceId, [c]);
  }
  return by;
}

export function serviceStats(r: CleanOk, target: number = SLA_TARGET): ServiceStat[] {
  const intervalMs = r.intervalMin * 60_000;
  const expected = Math.round((r.rangeEnd - r.rangeStart) / intervalMs) + 1;
  const allowedDowntimeMin = expected * r.intervalMin * (100 - target) / 100;
  const by = groupByService(r.checks);
  const stats = r.services.map(({ id }): ServiceStat => {
    const cs = by.get(id) ?? [];
    let valid = 0;
    let failed = 0;
    const latencies: number[] = [];
    for (const c of cs) {
      if (!c.isValid) continue;
      valid++;
      if (c.isFailed) failed++;
      else if (c.latencyMs !== null) latencies.push(c.latencyMs);
    }
    latencies.sort((a, b) => a - b);
    const availability = valid ? (100 * (valid - failed)) / valid : null;
    const downtimeMin = failed * r.intervalMin;
    return {
      serviceId: id, valid, failed, present: cs.length, expected,
      availability, met: availability === null ? null : availability >= target,
      downtimeMin, allowedDowntimeMin, timesAllowance: downtimeMin / allowedDowntimeMin,
      p50Ms: percentile(latencies, 0.5), p95Ms: percentile(latencies, 0.95),
      coverage: (100 * cs.length) / expected,
    };
  });
  return stats.sort((a, b) => (a.availability ?? Infinity) - (b.availability ?? Infinity) || a.serviceId.localeCompare(b.serviceId));
}
