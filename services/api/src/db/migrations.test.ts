import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanCsv, serviceStats, type CleanOk } from '@sla/core';

// Neon already holds uploads stored before 002: its backfill must give the values core computes.
const sql = (file: string) => readFileSync(new URL(`./migrations/${file}`, import.meta.url), 'utf8');
const clean = cleanCsv(readFileSync(new URL('../../../../data/samples/monitoring_checks_9d_seed101.csv', import.meta.url), 'utf8')) as CleanOk;

let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(sql('001_init_schema.sql'));
  // An upload as the pre-002 code stored it (no met/allowance/coverage, no agents/regions on uploads).
  const u = await pg.query<{ id: string }>(
    `insert into uploads (file_name, file_sha256, range_start, range_end, interval_min, services, rows_total, rows_stored,
       rows_merged, rows_fixed, rows_rejected, expected_checks, issues)
     values ('old.csv', 'old', '2025-04-06T00:00:00Z', '2025-04-14T23:45:00Z', 15, 5, 4672, 4320, 352, 0, 0, 4320, '{}') returning id`);
  const id = u.rows[0]!.id;
  for (const s of serviceStats(clean)) {
    await pg.query(`insert into service_stats (upload_id, service_id, valid, failed, present, availability, downtime_min) values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, s.serviceId, s.valid, s.failed, s.present, s.availability, s.downtimeMin]);
  }
  await pg.query(`insert into checks (upload_id, service_id, slot_ts, status_code, is_valid, is_failed, agents, region, quality_flags)
                  values ($1, 'a', '2025-04-06T00:00:00Z', 200, true, false, '{"agent-2","agent-1"}', 'eu-west-1', '{}'),
                         ($1, 'b', '2025-04-06T00:00:00Z', 200, true, false, '{"agent-1"}', null, '{}')`, [id]);
  await pg.exec(sql('002_store_core_results.sql'));
  await pg.exec(sql('002_store_core_results.sql')); // safe to run twice
}, 60_000);
afterAll(() => pg.close());

describe('migration 002 backfill', () => {
  it('service_stats get the values core computes', async () => {
    const rows = (await pg.query<{ service_id: string; expected: number; met: boolean; allowed_downtime_min: string; times_allowance: string; coverage: string }>(
      'select service_id, expected, met, allowed_downtime_min, times_allowance, coverage from service_stats order by service_id')).rows;
    const core = serviceStats(clean).sort((a, b) => a.serviceId.localeCompare(b.serviceId));
    expect(rows.map(r => r.service_id)).toEqual(core.map(s => s.serviceId));
    rows.forEach((r, i) => {
      const s = core[i]!;
      expect(r.expected).toBe(s.expected);
      expect(r.met).toBe(s.met);
      expect(Number(r.allowed_downtime_min)).toBeCloseTo(s.allowedDowntimeMin, 6);
      expect(Number(r.times_allowance)).toBeCloseTo(s.timesAllowance, 6);
      expect(Number(r.coverage)).toBeCloseTo(s.coverage, 6);
    });
  });
  it('uploads get their agents and regions from the stored checks', async () => {
    const u = (await pg.query<{ agents: string[]; regions: string[] }>('select agents, regions from uploads')).rows[0]!;
    expect(u).toEqual({ agents: ['agent-1', 'agent-2'], regions: ['eu-west-1'] });
  });
});
