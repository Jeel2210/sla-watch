import { describe, expect, it } from 'vitest';
import { hourlyFailures } from '../src/index';
import { cleanSample } from './helpers';

describe('hourlyFailures — 30-day sample', () => {
  const rows = hourlyFailures(cleanSample('30d'));
  it('has one row per service per hour', () => {
    expect(rows).toHaveLength(5 * 30 * 24);
  });
  it('adds up to the stored and failed checks', () => {
    let checks = 0; let failed = 0;
    for (const r of rows) { checks += r.checks; failed += r.failed; }
    expect(checks).toBe(14400);
    expect(failed).toBe(182);
  });
  it('rows are aligned to the hour and each hour holds at most 4 checks', () => {
    for (const r of rows) {
      expect(r.hour % 3_600_000).toBe(0);
      expect(r.checks).toBeLessThanOrEqual(4);
    }
  });
  it('shows the auth outage as a streak of failing hours on 22 Apr', () => {
    const auth = rows.filter(r => r.serviceId === 'svc-auth' && r.failed > 0 && new Date(r.hour).toISOString().startsWith('2025-04-22'));
    expect(auth.reduce((s, r) => s + r.failed, 0)).toBe(18);
  });
});
