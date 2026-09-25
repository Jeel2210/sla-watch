import type { CleanIssues, CleanOk, HourlyFailure, Incident, RejectedRow, RowSummary, ServiceStat, UploadSummary } from '@sla/core';
import { incidentsByService } from '@sla/core';
import type { Db } from './client';
import { insertRows, pgTextArray } from './insert';

/** Integer columns: latencies can be fractional after unit conversion (s, µs). */
const toInt = (n: number | null) => (n === null ? null : Math.round(n));
/** Timestamps are sent as ISO strings: unambiguous UTC for every driver (Date objects may serialise in local time). */
const iso = (ms: number) => new Date(ms).toISOString();

/** A row of `uploads` as pg returns it (timestamptz → Date). */
export interface UploadRow {
  id: string;
  file_name: string;
  file_sha256: string;
  uploaded_at: Date;
  range_start: Date;
  range_end: Date;
  interval_min: number;
  services: number;
  rows_total: number;
  rows_stored: number;
  rows_merged: number;
  rows_fixed: number;
  rows_rejected: number;
  expected_checks: number;
  issues: CleanIssues;
  agents: string[];
  regions: string[];
  interval_hits: number | null;
  total_gaps: number | null;
}

export function toUploadSummary(u: UploadRow): UploadSummary {
  const intervalMs = u.interval_min * 60_000;
  return {
    id: u.id,
    fileName: u.file_name,
    uploadedAt: u.uploaded_at.toISOString(),
    rangeStart: u.range_start.toISOString(),
    rangeEnd: u.range_end.toISOString(),
    days: (u.range_end.getTime() - u.range_start.getTime() + intervalMs) / 86_400_000,
    intervalMin: u.interval_min,
    services: u.services,
    expectedChecks: u.expected_checks,
    rowsTotal: u.rows_total,
    rowsStored: u.rows_stored,
    rowsMerged: u.rows_merged,
    rowsFixed: u.rows_fixed,
    rowsRejected: u.rows_rejected,
  };
}

export async function findUploadBySha256(db: Db, sha256: string): Promise<UploadRow | undefined> {
  const r = await db.query<UploadRow>('select * from uploads where file_sha256 = $1', [sha256]);
  return r.rows[0];
}

export async function rejectedSample(db: Db, uploadId: string, limit: number): Promise<RejectedRow[]> {
  const r = await db.query<{ line: number; raw: string; reason: string }>(
    'select line_no as line, raw, reason from rejected_rows where upload_id = $1 order by line_no limit $2',
    [uploadId, limit],
  );
  return r.rows;
}

/** Newest first; keyset paging on (uploaded_at, id) so deep pages stay fast. */
export async function listUploads(
  db: Db,
  opts: { limit: number; after?: { uploadedAt: string; id: string }; search?: string },
): Promise<{ rows: UploadRow[]; hasMore: boolean }> {
  const r = await db.query<UploadRow>(
    `select * from uploads
      where ($1::text is null or file_name ilike $1)
        and ($2::timestamptz is null or (uploaded_at, id) < ($2::timestamptz, $3::uuid))
      order by uploaded_at desc, id desc
      limit $4`,
    [opts.search ?? null, opts.after?.uploadedAt ?? null, opts.after?.id ?? null, opts.limit + 1],
  );
  return { rows: r.rows.slice(0, opts.limit), hasMore: r.rows.length > opts.limit };
}

/**
 * Stores one cleaned upload and everything derived from it. Call inside `transaction()`.
 * Returns undefined when the same file (sha256) was stored meanwhile — the caller treats it as a duplicate.
 */
export async function insertUpload(
  db: Db,
  input: { fileName: string; sha256: string; clean: CleanOk; summary: RowSummary; stats: ServiceStat[]; incidents: Incident[]; hourly: HourlyFailure[] },
): Promise<UploadRow | undefined> {
  const { clean, summary } = input;
  const r = await db.query<UploadRow>(
    `insert into uploads (file_name, file_sha256, range_start, range_end, interval_min, services,
       rows_total, rows_stored, rows_merged, rows_fixed, rows_rejected, expected_checks, issues,
       agents, regions, interval_hits, total_gaps)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     on conflict (file_sha256) do nothing
     returning *`,
    [input.fileName, input.sha256, iso(clean.rangeStart), iso(clean.rangeEnd), clean.intervalMin, clean.services.length,
      summary.rowsTotal, summary.rowsStored, summary.rowsMerged, summary.rowsFixed, summary.rowsRejected, clean.expectedChecks,
      JSON.stringify(clean.issues), pgTextArray(clean.agents), pgTextArray(clean.regions), clean.intervalHits, clean.totalGaps],
  );
  const upload = r.rows[0];
  if (!upload) return undefined;
  const id = upload.id;
  const perService = incidentsByService(input.incidents);

  await insertRows(db, 'checks',
    ['upload_id', 'service_id', 'slot_ts', 'status_code', 'is_valid', 'is_failed', 'latency_ms', 'agents', 'region', 'quality_flags'],
    clean.checks.map(c => [id, c.serviceId, iso(c.slot), c.status, c.isValid, c.isFailed, toInt(c.latencyMs), pgTextArray(c.agents), c.region, pgTextArray(c.flags)]));
  await insertRows(db, 'rejected_rows', ['upload_id', 'line_no', 'raw', 'reason'],
    clean.rejected.map(x => [id, x.line, x.raw, x.reason]));
  await insertRows(db, 'services', ['upload_id', 'service_id', 'service_name'],
    clean.services.map(s => [id, s.id, s.name]));
  await insertRows(db, 'service_stats',
    ['upload_id', 'service_id', 'valid', 'failed', 'present', 'availability', 'downtime_min', 'p50_ms', 'p95_ms', 'incidents',
      'longest_incident_min', 'expected', 'met', 'allowed_downtime_min', 'times_allowance', 'coverage'],
    input.stats.map(s => {
      const inc = perService.get(s.serviceId);
      return [id, s.serviceId, s.valid, s.failed, s.present, s.availability, Math.round(s.downtimeMin), toInt(s.p50Ms), toInt(s.p95Ms),
        inc?.count ?? 0, inc?.longestMin ?? null, s.expected, s.met, s.allowedDowntimeMin, s.timesAllowance, s.coverage];
    }));
  await insertRows(db, 'hourly_failures', ['upload_id', 'service_id', 'hour_ts', 'checks', 'failed'],
    input.hourly.map(h => [id, h.serviceId, iso(h.hour), h.checks, h.failed]));
  await insertRows(db, 'incidents', ['upload_id', 'service_id', 'start_ts', 'end_ts', 'failed', 'median_latency_ms', 'normal_latency_ms'],
    input.incidents.map(i => [id, i.serviceId, iso(i.start), iso(i.end), i.failedChecks, toInt(i.medianLatencyMs), toInt(i.normalLatencyMs)]));
  return upload;
}
