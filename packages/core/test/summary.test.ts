import { describe, expect, it } from 'vitest';
import { detectIncidents, incidentsByService, rowSummary, type Incident } from '../src/index';
import { cleanSample, SAMPLE_FILES, type SampleKey } from './helpers';

describe('rowSummary', () => {
  it('30-day sample: exact counts', () => {
    expect(rowSummary(cleanSample('30d'))).toEqual({
      rowsTotal: 15577, rowsStored: 14400, rowsMerged: 1177, rowsFixed: 3280, rowsRejected: 0,
    });
  });
  it.each(Object.keys(SAMPLE_FILES) as SampleKey[])('%s: every uploaded row is stored, merged or rejected', key => {
    const s = rowSummary(cleanSample(key));
    expect(s.rowsStored + s.rowsMerged + s.rowsRejected).toBe(s.rowsTotal);
    expect(s.rowsFixed).toBeLessThanOrEqual(s.rowsStored);
  });
});

describe('incidentsByService', () => {
  it('30-day sample: one incident each, longest in minutes', () => {
    expect(Object.fromEntries(incidentsByService(detectIncidents(cleanSample('30d'))))).toEqual({
      'svc-reports': { count: 1, longestMin: 135 },
      'svc-auth': { count: 1, longestMin: 375 },
    });
  });
  it('counts several incidents and keeps the longest', () => {
    const inc = (start: number, end: number): Incident => ({ serviceId: 'a', start, end, failedChecks: 2, medianLatencyMs: null, normalLatencyMs: null });
    expect(incidentsByService([inc(0, 30 * 60_000), inc(0, 90 * 60_000), inc(0, 45 * 60_000)]).get('a')).toEqual({ count: 3, longestMin: 90 });
  });
  it('services without incidents are absent', () => {
    expect(incidentsByService([]).size).toBe(0);
  });
});
