import type { CleanOk, HourlyFailure } from './types';

const HOUR = 3_600_000;

export function hourlyFailures(r: CleanOk): HourlyFailure[] {
  const byKey = new Map<string, HourlyFailure>();
  for (const c of r.checks) {
    const hour = Math.floor(c.slot / HOUR) * HOUR;
    const key = `${c.serviceId}|${hour}`;
    let row = byKey.get(key);
    if (!row) { row = { serviceId: c.serviceId, hour, checks: 0, failed: 0 }; byKey.set(key, row); }
    row.checks++;
    if (c.isFailed) row.failed++;
  }
  return [...byKey.values()].sort((a, b) => a.serviceId.localeCompare(b.serviceId) || a.hour - b.hour);
}
