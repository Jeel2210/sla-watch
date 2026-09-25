import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanCsv, detectIncidents, hourlyFailures, rowSummary, serviceStats, type CleanOk } from '@sla/core';
import { createTestDb, type TestDb } from '../test/pgdb';
import { findUploadBySha256, insertUpload, listUploads, rejectedSample, toUploadSummary } from './queries';

// Real SQL against real Postgres (PGlite) with the 30-day sample.
const csv = readFileSync(new URL('../../../../data/samples/monitoring_checks_30d_seed404.csv', import.meta.url), 'utf8');
const clean = cleanCsv(csv) as CleanOk;
const input = (sha256: string, fileName = '30d.csv') => ({
  fileName, sha256, clean, summary: rowSummary(clean),
  stats: serviceStats(clean), incidents: detectIncidents(clean), hourly: hourlyFailures(clean),
});

let t: TestDb;
beforeAll(async () => { t = await createTestDb(); }, 60_000);
afterAll(() => t.close());

describe('insertUpload', () => {
  it('stores the upload and every derived table in one transaction', async () => {
    const u = await t.transaction(tx => insertUpload(tx, input('sha-30d')));
    expect(u).toBeDefined();
    expect(toUploadSummary(u!)).toMatchObject({
      fileName: '30d.csv', days: 30, intervalMin: 15, services: 5, expectedChecks: 14400,
      rowsTotal: 15577, rowsStored: 14400, rowsMerged: 1177, rowsFixed: 3280, rowsRejected: 0,
      rangeStart: '2025-04-06T00:00:00.000Z', rangeEnd: '2025-05-05T23:45:00.000Z',
    });
    const count = async (table: string) => Number((await t.db.query<{ n: string }>(`select count(*) as n from ${table} where upload_id = $1`, [u!.id])).rows[0]!.n);
    expect(await count('checks')).toBe(14400);
    expect(await count('services')).toBe(5);
    expect(await count('service_stats')).toBe(5);
    expect(await count('hourly_failures')).toBe(3600);
    expect(await count('incidents')).toBe(2);
    const auth = (await t.db.query<{ incidents: number; longest_incident_min: number }>(
      `select incidents, longest_incident_min from service_stats where upload_id = $1 and service_id = 'svc-auth'`, [u!.id])).rows[0];
    expect(auth).toEqual({ incidents: 1, longest_incident_min: 375 });
    expect(await rejectedSample(t.db, u!.id, 10)).toEqual([]);
  });

  it('same sha256 again → undefined (caller answers "duplicate"), nothing new stored', async () => {
    expect(await t.transaction(tx => insertUpload(tx, input('sha-30d')))).toBeUndefined();
    expect((await findUploadBySha256(t.db, 'sha-30d'))?.file_name).toBe('30d.csv');
  });

  it('a failure part-way rolls everything back', async () => {
    const broken = { ...input('sha-broken'), hourly: [{ serviceId: 'x', hour: NaN, checks: 1, failed: 0 }] };
    await expect(t.transaction(tx => insertUpload(tx, broken))).rejects.toThrow();
    expect(await findUploadBySha256(t.db, 'sha-broken')).toBeUndefined();
  });
});

describe('listUploads', () => {
  beforeAll(async () => {
    for (const n of [1, 2, 3]) await t.transaction(tx => insertUpload(tx, { ...input(`sha-${n}`, `extra_${n}%.csv`), clean: { ...clean, checks: [] }, stats: [], incidents: [], hourly: [] }));
  });
  it('pages newest first with a keyset cursor, no row twice or missed', async () => {
    const first = await listUploads(t.db, { limit: 2 });
    expect(first.hasMore).toBe(true);
    const last = first.rows[1]!;
    const second = await listUploads(t.db, { limit: 2, after: { uploadedAt: last.uploaded_at.toISOString(), id: last.id } });
    const ids = [...first.rows, ...second.rows].map(r => r.id);
    expect(new Set(ids).size).toBe(4);
    expect(second.hasMore).toBe(false);
  });
  it('searches file names, treating % literally', async () => {
    expect((await listUploads(t.db, { limit: 10, search: '%extra\\_2\\%%' })).rows.map(r => r.file_name)).toEqual(['extra_2%.csv']);
  });
});
