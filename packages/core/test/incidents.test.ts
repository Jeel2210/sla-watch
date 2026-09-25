import { describe, expect, it } from 'vitest';
import { detectIncidents } from '../src/index';
import { cleanSample, readSample, SAMPLE_FILES, type SampleKey } from './helpers';

const iso = (ms: number) => new Date(ms).toISOString();

describe('detectIncidents — 30-day sample', () => {
  const inc = detectIncidents(cleanSample('30d'));
  it('finds the two outages with exact windows', () => {
    expect(inc.map(i => [i.serviceId, iso(i.start), iso(i.end), i.failedChecks])).toEqual([
      ['svc-reports', '2025-04-09T11:45:00.000Z', '2025-04-09T14:00:00.000Z', 7],
      ['svc-auth', '2025-04-22T04:00:00.000Z', '2025-04-22T10:15:00.000Z', 18],
    ]);
  });
  it('reports latency during vs normal (outages run 3–4× slower)', () => {
    for (const i of inc) expect(i.medianLatencyMs! / i.normalLatencyMs!).toBeGreaterThan(2.5);
  });
});

describe('detectIncidents — counts per sample', () => {
  it.each([['9d', 2], ['12d', 2], ['14d', 3], ['21d', 3], ['30d', 2]] as [SampleKey, number][])('%s → %i incidents', (key, n) => {
    expect(detectIncidents(cleanSample(key))).toHaveLength(n);
  });
});

describe('answer key (data/samples/dataset_incident_log.json)', () => {
  const log = JSON.parse(readSample('dataset_incident_log.json')) as Record<string, { start: string; incidents: Record<string, string> }>;
  const FIFTEEN = 15 * 60_000;
  for (const key of Object.keys(SAMPLE_FILES) as SampleKey[]) {
    const entry = log[SAMPLE_FILES[key]]!;
    for (const [label, window] of Object.entries(entry.incidents)) {
      it(`${key}: ${label} (${window}) is detected`, () => {
        const [, serviceId, day] = /^(\S+) day (\d+)$/.exec(label)!;
        const [, from, to] = /check-points (\d+)-(\d+)/.exec(window)!;
        const base = Date.parse(`${entry.start}T00:00:00Z`) + Number(day) * 96 * FIFTEEN;
        const start = base + Number(from) * FIFTEEN;
        const end = base + (Number(to) + 1) * FIFTEEN;
        const found = detectIncidents(cleanSample(key)).filter(i => i.serviceId === serviceId && i.start < end && i.end > start);
        expect(found).toHaveLength(1);
      });
    }
  }
});

describe('rules', () => {
  it('a single isolated failure is not an incident', () => {
    const r = cleanSample('30d');
    const notify = detectIncidents(r).filter(i => i.serviceId === 'svc-notify');
    expect(notify).toEqual([]); // 8 scattered failures, none in a row
  });
});
