import { describe, expect, it } from 'vitest';
import { cleanSample, type SampleKey } from './helpers';

const EXPECTED: Record<SampleKey, {
  start: string; days: number; rows: number; checks: number; exactDup: number; epoch: number; offset: number;
  seconds: number; latMissing: number; mergedRows: number; failed: number; invalid: number; nullLatency: number;
}> = {
  '9d':  { start: '2025-05-08T00:00:00.000Z', days: 9,  rows: 4672,  checks: 4320,  exactDup: 6,  epoch: 70,  offset: 32,  seconds: 924,  latMissing: 56,  mergedRows: 346,  failed: 41,  invalid: 1, nullLatency: 48 },
  '12d': { start: '2025-04-10T00:00:00.000Z', days: 12, rows: 6230,  checks: 5760,  exactDup: 8,  epoch: 93,  offset: 43,  seconds: 1227, latMissing: 74,  mergedRows: 462,  failed: 77,  invalid: 1, nullLatency: 66 },
  '14d': { start: '2025-05-19T00:00:00.000Z', days: 14, rows: 7269,  checks: 6720,  exactDup: 10, epoch: 109, offset: 50,  seconds: 1433, latMissing: 87,  mergedRows: 539,  failed: 105, invalid: 0, nullLatency: 72 },
  '21d': { start: '2025-04-03T00:00:00.000Z', days: 21, rows: 10904, checks: 10080, exactDup: 18, epoch: 163, offset: 76,  seconds: 2147, latMissing: 130, mergedRows: 806,  failed: 124, invalid: 1, nullLatency: 108 },
  '30d': { start: '2025-04-06T00:00:00.000Z', days: 30, rows: 15577, checks: 14400, exactDup: 24, epoch: 233, offset: 109, seconds: 3090, latMissing: 186, mergedRows: 1153, failed: 182, invalid: 1, nullLatency: 167 },
};

describe.each(Object.entries(EXPECTED) as [SampleKey, (typeof EXPECTED)[SampleKey]][])('sample %s', (key, e) => {
  const r = cleanSample(key);
  it('detects range, interval and services from the data', () => {
    expect(new Date(r.rangeStart).toISOString()).toBe(e.start);
    expect(r.days).toBe(e.days);
    expect(r.intervalMin).toBe(15);
    expect(r.intervalHits).toBe(r.totalGaps);
    expect(r.services).toHaveLength(5);
    expect(r.regions).toEqual(['ap-south-1']);
    expect(r.agents).toEqual(['agent-1', 'agent-2']);
  });
  it('stores exactly services × days × 96 checks with nothing rejected', () => {
    expect(r.rowsTotal).toBe(e.rows);
    expect(r.checks).toHaveLength(e.checks);
    expect(r.expectedChecks).toBe(5 * e.days * 96);
    expect(r.gaps).toBe(0);
    expect(r.rejected).toEqual([]);
  });
  it('finds every known data issue', () => {
    expect(r.issues.exactDuplicates).toBe(e.exactDup);
    expect(r.issues.epoch).toBe(e.epoch);
    expect(r.issues.offset).toBe(e.offset);
    expect(r.issues.offsets).toEqual({ '+05:30': e.offset });
    expect(r.issues.unitConverted).toEqual({ s: e.seconds });
    expect(r.issues.latencyMissing).toBe(e.latMissing);
    expect(r.issues.latencyNegative).toBe(1);
    expect(r.issues.invalidStatus).toBe(1);
    expect(r.issues.mergedRows).toBe(e.mergedRows);
    expect(r.issues.status4xx).toBe(0);
    expect(r.issues.snapped).toBe(0);
  });
  it('classifies checks', () => {
    expect(r.checks.filter(c => c.isFailed)).toHaveLength(e.failed);
    expect(r.checks.filter(c => !c.isValid)).toHaveLength(e.invalid);
    expect(r.checks.filter(c => c.latencyMs === null)).toHaveLength(e.nullLatency);
  });
});
