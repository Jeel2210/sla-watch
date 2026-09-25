import { describe, expect, it } from 'vitest';
import { batches, cleanCsv, detectIncidents, hourlyFailures, serviceStats, type CleanOk } from '../src/index';
import { hasStress, readStress } from './helpers';

const SMALL = 'stress_small_10svc_14d_seed11.csv';
const CHAOS = 'stress_chaos_30svc_30d_seed55.csv';
const LARGE = 'stress_large_50svc_90d_seed33.csv';
const ok = (name: string): CleanOk => {
  const r = cleanCsv(readStress(name));
  if (!r.ok) throw new Error(r.message);
  return r;
};

describe.skipIf(!hasStress(SMALL))('stress small — 10 services × 14 days', () => {
  it('stores every check and reports the gaps', () => {
    const r = ok(SMALL);
    expect(r.services).toHaveLength(10);
    expect(r.checks).toHaveLength(13403);
    expect(r.gaps).toBe(37);
    expect(r.rejected).toEqual([]);
  });
});

describe.skipIf(!hasStress(CHAOS))('stress chaos — 30 services, messy fields', () => {
  const r = hasStress(CHAOS) ? ok(CHAOS) : (null as unknown as CleanOk);
  it('reads everything: padded fields, upper-case units, 4xx', () => {
    expect(r.rejected).toEqual([]);
    expect(r.checks).toHaveLength(86128);
    expect(r.issues.trimmed).toBe(495);
    expect(r.issues.unitCase).toBe(914);
    expect(r.issues.status4xx).toBe(276);
  });
  it('keeps one name per service after trimming', () => {
    expect(r.services).toHaveLength(30);
    expect(r.services.every(s => s.name === s.name.trim())).toBe(true);
  });
  it('detects 3 agents and 4 regions', () => {
    expect(r.agents).toHaveLength(3);
    expect(r.regions).toEqual(['ap-south-1', 'ap-southeast-2', 'eu-west-1', 'us-east-1']);
  });
  it('4xx never counts as a failure', () => {
    expect(r.checks.filter(c => c.status >= 400 && c.status < 500 && c.isFailed)).toEqual([]);
  });
});

describe.skipIf(!hasStress(LARGE))('stress large — 50 services × 90 days', () => {
  it('cleans ~464k rows without crashing, in reasonable time', () => {
    const t = performance.now();
    const r = ok(LARGE);
    const stats = serviceStats(r);
    const inc = detectIncidents(r);
    const hours = hourlyFailures(r);
    expect(r.rowsTotal).toBe(463637);
    expect(r.checks).toHaveLength(430738);
    expect(r.gaps).toBe(1262);
    expect(stats).toHaveLength(50);
    expect(inc.length).toBeGreaterThan(0);
    expect(hours.length).toBeLessThanOrEqual(50 * 90 * 24);
    expect([...batches(r.checks)].length).toBe(Math.ceil(430738 / 5_000)); // 87 writes of ≤ 5,000 rows
    expect(performance.now() - t).toBeLessThan(30_000);
  }, 60_000);
});
