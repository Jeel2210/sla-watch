import { describe, expect, it } from 'vitest';
import { percentile, serviceStats } from '../src/index';
import { cleanSample } from './helpers';

describe('percentile', () => {
  it('uses nearest rank on a sorted array', () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(20);
    expect(percentile([10, 20, 30, 40], 0.95)).toBe(30);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe('serviceStats — 30-day sample', () => {
  const stats = serviceStats(cleanSample('30d'));
  const by = Object.fromEntries(stats.map(s => [s.serviceId, s]));

  it('sorts worst availability first', () => {
    expect(stats.map(s => s.serviceId)).toEqual(['svc-reports', 'svc-payments', 'svc-auth', 'svc-search', 'svc-notify']);
  });
  it('computes availability, downtime and allowance', () => {
    const r = by['svc-reports']!;
    expect(r.valid).toBe(2880);
    expect(r.failed).toBe(82);
    expect(r.availability!).toBeCloseTo(97.153, 3);
    expect(r.met).toBe(false);
    expect(r.downtimeMin).toBe(1230);
    expect(r.allowedDowntimeMin).toBeCloseTo(43.2, 6);
    expect(r.timesAllowance).toBeCloseTo(28.47, 2);
  });
  it('leaves the invalid 999 check out of availability but counts it as present', () => {
    const a = by['svc-auth']!;
    expect(a.valid).toBe(2879);
    expect(a.present).toBe(2880);
    expect(a.failed).toBe(29);
    expect(a.availability!).toBeCloseTo(98.993, 3);
    expect(a.coverage).toBe(100);
  });
  it('computes latency percentiles from successful checks', () => {
    expect([by['svc-reports']!.p50Ms, by['svc-reports']!.p95Ms]).toEqual([654, 845]);
    expect([by['svc-notify']!.p50Ms, by['svc-notify']!.p95Ms]).toEqual([113, 148]);
  });
  it('every service misses 99.9% in this file', () => {
    expect(stats.every(s => s.met === false)).toBe(true);
  });
});

describe('serviceStats — coverage with gaps', () => {
  it('reports coverage below 100% when checks are missing', () => {
    const r = cleanSample('9d');
    const trimmed = { ...r, checks: r.checks.filter((c, i) => !(c.serviceId === 'svc-auth' && i % 100 === 0)) };
    const auth = serviceStats(trimmed).find(s => s.serviceId === 'svc-auth')!;
    expect(auth.present).toBeLessThan(auth.expected);
    expect(auth.coverage).toBeLessThan(100);
  });
});
