import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AGENT_MULTI, cleanCsv, detectIncidents, serviceStats,
  type ChecksPage, type CleanOk, type HexPage, type IncidentRow, type ServicesPage, type TimelinePage, type UploadCreated,
  type UploadDetail, type UploadStats,
} from '@sla/core';
import type { Db } from '../db/client';
import { createTestDb, type TestDb } from '../test/pgdb';
import { handler } from '../handler';

// End to end on a real Postgres (PGlite): upload the samples through POST /uploads, then read them back.
const h = vi.hoisted(() => ({ t: undefined as unknown as { db: Db; transaction: <T>(fn: (tx: Db) => Promise<T>) => Promise<T> } }));
vi.mock('../db/client', () => ({
  db: { query: (text: string, values?: unknown[]) => h.t.db.query(text, values) },
  transaction: <T>(fn: (tx: Db) => Promise<T>) => h.t.transaction(fn),
}));
vi.spyOn(console, 'log').mockImplementation(() => {});

const sample = (name: string) => readFileSync(new URL(`../../../../data/samples/${name}`, import.meta.url));
const CSV_30D = sample('monitoring_checks_30d_seed404.csv');
const CSV_9D = sample('monitoring_checks_9d_seed101.csv');
const core30 = cleanCsv(CSV_30D.toString('utf8')) as CleanOk;

async function call<T>(method: string, path: string, query: Record<string, string | number> = {}, body?: Buffer) {
  const r = await handler({
    rawPath: path,
    requestContext: { http: { method } },
    queryStringParameters: Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])),
    headers: { 'x-file-name': 'sample.csv' },
    body: body?.toString('base64'),
    isBase64Encoded: !!body,
  }, { awsRequestId: 'req-1' });
  return { status: r.statusCode, body: JSON.parse(r.body ?? '{}') as T };
}
const get = <T>(path: string, query?: Record<string, string | number>) => call<T>('GET', path, query);

let t: TestDb;
let id: string;
let id9: string;
beforeAll(async () => {
  t = await createTestDb();
  h.t = t;
  id = (await call<UploadCreated>('POST', '/uploads', {}, gzipSync(CSV_30D))).body.id;
  id9 = (await call<UploadCreated>('POST', '/uploads', {}, gzipSync(CSV_9D))).body.id;
}, 120_000);
afterAll(() => t.close());

describe('GET /uploads/:id', () => {
  it('returns the data report facts', async () => {
    const r = await get<UploadDetail>(`/uploads/${id}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      id, days: 30, services: 5, intervalMin: 15, rowsTotal: 15577, rowsStored: 14400, rowsMerged: 1177, rowsRejected: 0,
      agents: core30.agents, regions: core30.regions, intervalHits: core30.intervalHits, totalGaps: core30.totalGaps,
      rejectedSample: [],
    });
    expect(r.body.serviceNames).toHaveLength(5);
    expect(r.body.issues.epoch).toBe(233);
  });
  it('unknown uuid → 404', async () => {
    expect((await get('/uploads/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
});

describe('GET /uploads/:id/stats', () => {
  it('matches core: missed services, allowance, incidents, lowest', async () => {
    const stats = serviceStats(core30);
    const r = await get<UploadStats>(`/uploads/${id}/stats`);
    expect(r.body).toEqual({
      slaTarget: 99.9,
      allowedDowntimeMin: expect.closeTo(43.2, 6),
      servicesTotal: 5,
      missed: stats.filter(s => s.met === false).length,
      incidents: 2,
      longestIncident: { serviceId: 'svc-auth', serviceName: expect.any(String), minutes: 375 },
      lowest: { serviceId: 'svc-reports', serviceName: expect.any(String), availability: expect.closeTo(97.153, 3) },
    });
  });
});

describe('GET /uploads/:id/services', () => {
  it('worst first, every KPI as core computed it', async () => {
    const r = await get<ServicesPage>(`/uploads/${id}/services`, { limit: 20 });
    const expected = serviceStats(core30);
    expect(r.body.total).toBe(5);
    expect(r.body.items.map(s => s.id)).toEqual(expected.map(s => s.serviceId));
    const reports = r.body.items[0]!;
    expect(reports).toMatchObject({ id: 'svc-reports', downtimeMin: 1230, allowedDowntimeMin: expect.closeTo(43.2, 6), p50Ms: 654, p95Ms: 845, met: false, incidents: 1, longestIncidentMin: 135 });
    expect(reports.timesAllowance).toBeCloseTo(28.47, 2);
    expect(r.body.items.find(s => s.id === 'svc-auth')).toMatchObject({ valid: 2879, present: 2880, expected: 2880 });
  });
  it('pages with a cursor: 2 + 2 + 1, no service twice', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const r: { body: ServicesPage } = await get<ServicesPage>(`/uploads/${id}/services`, { limit: 2, ...(cursor ? { cursor } : {}) });
      seen.push(...r.body.items.map(s => s.id));
      cursor = r.body.nextCursor;
    } while (cursor);
    expect(seen).toEqual(serviceStats(core30).map(s => s.serviceId));
  });
  it('searches by name or id on the server', async () => {
    const r = await get<ServicesPage>(`/uploads/${id}/services`, { q: 'AUTH' });
    expect(r.body.items.map(s => s.id)).toEqual(['svc-auth']);
    expect(r.body.total).toBe(1);
  });
});

describe('GET /uploads/:id/services/:sid/hex', () => {
  it('one page of days, 24 hours each; the auth outage on 22 Apr', async () => {
    // 6 Apr is day 0, so 22 Apr is day 16.
    const r = await get<HexPage>(`/uploads/${id}/services/svc-auth/hex`, { from: 16, days: 1 });
    expect(r.body).toMatchObject({ serviceId: 'svc-auth', totalDays: 30, from: 16 });
    const day = r.body.days[0]!;
    expect(day.day).toBe('2025-04-22');
    expect(day.hours).toHaveLength(24);
    expect(day.hours.reduce((n, x) => n + x.failed, 0)).toBe(18);
    expect(day.hours.filter(x => x.incident).map((_, i) => i)).toHaveLength(7);   // 04:00–10:15 touches hours 04–10
    expect(day.hours[3]!.incident).toBe(false);
  });
  it('the last page is cut to the days that exist', async () => {
    const r = await get<HexPage>(`/uploads/${id}/services/svc-auth/hex`, { from: 28, days: 7 });
    expect(r.body.days.map(d => d.day)).toEqual(['2025-05-04', '2025-05-05']);
  });
  it('unknown service → 404, day out of range → 400', async () => {
    expect((await get(`/uploads/${id}/services/svc-nope/hex`)).status).toBe(404);
    expect((await get(`/uploads/${id}/services/svc-auth/hex`, { from: 30 })).status).toBe(400);
  });
});

describe('GET /uploads/:id/timeline', () => {
  it('fixed bins per row; failures add up to what core counted', async () => {
    const r = await get<TimelinePage>(`/uploads/${id}/timeline`, { bins: 240 });
    expect(r.body).toMatchObject({ bins: 240, binMin: 180, total: 5, offset: 0, rangeStart: '2025-04-06T00:00:00.000Z' });
    for (const row of r.body.items) {
      expect(row.failed).toHaveLength(240);
      const s = serviceStats(core30).find(x => x.serviceId === row.serviceId)!;
      expect(row.failed.reduce((a, b) => a + b, 0)).toBe(s.failed);
    }
    const auth = r.body.items.find(x => x.serviceId === 'svc-auth')!;
    expect(auth.incidents).toHaveLength(1);
  });
  it('pages services by offset, worst first', async () => {
    const r = await get<TimelinePage>(`/uploads/${id}/timeline`, { offset: 4, limit: 10 });
    expect(r.body.items.map(x => x.serviceId)).toEqual([serviceStats(core30)[4]!.serviceId]);
  });
});

describe('GET /uploads/:id/incidents', () => {
  it('both outages in time order, with durations and latency', async () => {
    const r = await get<{ items: IncidentRow[]; nextCursor: string | null }>(`/uploads/${id}/incidents`);
    expect(r.body.items.map(i => [i.serviceId, i.start, i.durationMin, i.failed])).toEqual([
      ['svc-reports', '2025-04-09T11:45:00.000Z', 135, 7],
      ['svc-auth', '2025-04-22T04:00:00.000Z', 375, 18],
    ]);
    const core = detectIncidents(core30);
    expect(r.body.items[1]!.medianLatencyMs).toBe(Math.round(core[1]!.medianLatencyMs!));
  });
  it('pages with a cursor', async () => {
    const a = await get<{ items: IncidentRow[]; nextCursor: string }>(`/uploads/${id}/incidents`, { limit: 1 });
    const b = await get<{ items: IncidentRow[]; nextCursor: string | null }>(`/uploads/${id}/incidents`, { limit: 1, cursor: a.body.nextCursor });
    expect([a.body.items[0]!.serviceId, b.body.items[0]!.serviceId]).toEqual(['svc-reports', 'svc-auth']);
    expect(b.body.nextCursor).toBeNull();
  });
});

describe('GET /uploads/:id/checks', () => {
  const failedTotal = core30.checks.filter(c => c.isFailed).length;
  const changedTotal = core30.checks.filter(c => c.flags.length > 0).length;

  it('first page: 10 rows, failures first, counts per tab', async () => {
    const r = await get<ChecksPage>(`/uploads/${id}/checks`);
    expect(r.body.items).toHaveLength(10);
    expect(r.body.items.every(c => c.isFailed || !c.isValid)).toBe(true);
    expect(r.body.counts).toEqual({ all: 14400, failed: failedTotal, changed: changedTotal });
    expect(r.body.nextCursor).not.toBeNull();
  });
  it('single date (from day to next day, exclusive)', async () => {
    const r = await get<ChecksPage>(`/uploads/${id}/checks`, { from: '2025-04-22', to: '2025-04-23', service: 'svc-auth', tab: 'failed' });
    expect(r.body.counts).toMatchObject({ all: 96, failed: 18 });
    expect(r.body.items.every(c => c.slot.startsWith('2025-04-22') && c.isFailed)).toBe(true);
  });
  it('date range', async () => {
    const r = await get<ChecksPage>(`/uploads/${id}/checks`, { from: '2025-04-06', to: '2025-04-13' });
    expect(r.body.counts!.all).toBe(7 * 96 * 5);
  });
  it('an hour window (hex map click) in time order', async () => {
    const r = await get<ChecksPage>(`/uploads/${id}/checks`, { from: '2025-04-22T04:00:00Z', to: '2025-04-22T05:00:00Z', service: 'svc-auth', sort: 'old' });
    expect(r.body.items.map(c => c.slot.slice(11, 16))).toEqual(['04:00', '04:15', '04:30', '04:45']);
  });
  it.each(['old', 'new', 'fail'] as const)('sort %s: cursor pages through every row once', async sort => {
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const r: { body: ChecksPage } = await get<ChecksPage>(`/uploads/${id}/checks`, { service: 'svc-reports', from: '2025-04-09', to: '2025-04-10', sort, limit: 50, ...(cursor ? { cursor } : {}) });
      for (const c of r.body.items) seen.add(c.slot);
      if (pages > 0) expect(r.body.counts).toBeNull();
      cursor = r.body.nextCursor;
      pages++;
    } while (cursor);
    expect(seen.size).toBe(96);
    expect(pages).toBe(2);
  });
  it('newest first really is newest first', async () => {
    const r = await get<ChecksPage>(`/uploads/${id}/checks`, { sort: 'new', limit: 2 });
    expect(r.body.items.map(c => c.slot)).toEqual(['2025-05-05T23:45:00.000Z', '2025-05-05T23:45:00.000Z']);
  });
  it('agent, 2+ agents and region filters', async () => {
    const multi = await get<ChecksPage>(`/uploads/${id}/checks`, { agent: AGENT_MULTI });
    expect(multi.body.counts!.all).toBe(core30.checks.filter(c => c.agents.length > 1).length);
    const agent = core30.agents[0]!;
    const one = await get<ChecksPage>(`/uploads/${id}/checks`, { agent });
    expect(one.body.counts!.all).toBe(core30.checks.filter(c => c.agents.includes(agent)).length);
    const region = core30.regions[0]!;
    const reg = await get<ChecksPage>(`/uploads/${id}/checks`, { region });
    expect(reg.body.counts!.all).toBe(core30.checks.filter(c => c.region === region).length);
  });
  it('changed tab shows what cleaning did', async () => {
    const r = await get<ChecksPage>(`/uploads/${id}/checks`, { tab: 'changed', sort: 'old', limit: 5 });
    expect(r.body.items.every(c => c.flags.length > 0)).toBe(true);
  });
  it('uploads never mix: the 9-day upload has its own checks', async () => {
    expect((await get<ChecksPage>(`/uploads/${id9}/checks`)).body.counts!.all).toBe(4320);
  });
  it.each([
    { from: 'yesterday' }, { from: '2025-04-22T04:00' }, { from: '2025-04-23', to: '2025-04-22' },
    { tab: 'broken' }, { sort: 'random' }, { limit: 51 }, { cursor: 'x' }, { service: "' or 1=1 --", from: 'nope' },
  ] as Record<string, string | number>[])('bad input %o → 400', async query => {
    expect((await get(`/uploads/${id}/checks`, query)).status).toBe(400);
  });
  it('SQL-looking text is just a value: no match, no error', async () => {
    const r = await get<ChecksPage>(`/uploads/${id}/checks`, { service: "' or 1=1 --" });
    expect(r.status).toBe(200);
    expect(r.body.counts!.all).toBe(0);
  });
});
