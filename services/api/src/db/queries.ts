import { QueryResult, queryTx, query } from './client';
import { batches } from '@sla/core';

export interface Upload {
  id: string;
  file_name: string;
  file_sha256: string;
  uploaded_at: string;
  range_start: string;
  range_end: string;
  interval_min: number;
  services: number;
  rows_total: number;
  rows_stored: number;
  rows_merged: number;
  rows_fixed: number;
  rows_rejected: number;
  expected_checks: number;
  issues: Record<string, any>;
}

export interface Check {
  upload_id: string;
  service_id: string;
  slot_ts: string;
  status_code: number;
  is_valid: boolean;
  is_failed: boolean;
  latency_ms: number | null;
  agents: string[];
  region: string | null;
  quality_flags: string[];
}

export interface ServiceStat {
  upload_id: string;
  service_id: string;
  valid: number;
  failed: number;
  present: number;
  availability: number;
  downtime_min: number;
  p50_ms: number | null;
  p95_ms: number | null;
  incidents: number;
  longest_incident_min: number | null;
}

export interface Incident {
  upload_id: string;
  service_id: string;
  start_ts: string;
  end_ts: string;
  failed: number;
  median_latency_ms: number | null;
  normal_latency_ms: number | null;
}

export async function insertUpload(
  client: any,
  data: Omit<Upload, 'id' | 'uploaded_at'> & { uploaded_at?: string }
): Promise<Upload> {
  const result = await queryTx(
    client,
    `insert into uploads (
      file_name, file_sha256, range_start, range_end, interval_min,
      services, rows_total, rows_stored, rows_merged, rows_fixed,
      rows_rejected, expected_checks, issues
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    returning *`,
    [
      data.file_name,
      data.file_sha256,
      data.range_start,
      data.range_end,
      data.interval_min,
      data.services,
      data.rows_total,
      data.rows_stored,
      data.rows_merged,
      data.rows_fixed,
      data.rows_rejected,
      data.expected_checks,
      JSON.stringify(data.issues),
    ]
  );
  return result.rows[0] as Upload;
}

export async function findUploadBySha256(
  client: any,
  sha256: string
): Promise<Upload | null> {
  const result = await queryTx(
    client,
    'select * from uploads where file_sha256 = $1',
    [sha256]
  );
  return result.rows[0] as Upload | null;
}

export async function getUpload(
  client: any,
  uploadId: string
): Promise<Upload | null> {
  const result = await queryTx(
    client,
    'select * from uploads where id = $1',
    [uploadId]
  );
  return result.rows[0] as Upload | null;
}

export async function listUploads(
  { cursor, limit = 20, q }: { cursor?: string; limit?: number; q?: string }
): Promise<{ rows: Upload[]; nextCursor?: string }> {
  const safeLimit = Math.min(limit, 50);
  const search = q ? `%${q}%` : null;

  let sql = 'select * from uploads';
  let params: any[] = [];
  let paramCount = 1;

  if (search) {
    sql += ` where file_name ilike $${paramCount}`;
    params.push(search);
    paramCount++;
  }

  if (cursor) {
    const cursorParts = cursor.split(':');
    if (params.length > 0) sql += ' and';
    else sql += ' where';
    sql += ` uploaded_at < $${paramCount}`;
    params.push(cursorParts[0]);
  }

  sql += ` order by uploaded_at desc limit ${safeLimit + 1}`;

  const result = await query<Upload>(sql, params);

  const rows = (result.rows as Upload[]).slice(0, safeLimit);
  const hasMore = result.rows.length > safeLimit;
  const nextCursor = hasMore
    ? `${(result.rows[safeLimit] as any).uploaded_at}:${(result.rows[safeLimit] as any).id}`
    : undefined;

  return { rows, nextCursor };
}

export async function insertChecks(
  client: any,
  uploadId: string,
  checks: Array<{
    service_id: string;
    slot_ts: string;
    status_code: number;
    is_valid: boolean;
    is_failed: boolean;
    latency_ms: number | null;
    agents: string[];
    region: string | null;
    quality_flags: string[];
  }>
): Promise<void> {
  for (const batch of batches(checks, 5000)) {
    const values = batch.map((c: any) => [
      uploadId,
      c.service_id,
      c.slot_ts,
      c.status_code,
      c.is_valid,
      c.is_failed,
      c.latency_ms,
      c.agents,
      c.region,
      c.quality_flags,
    ]);

    const placeholders = values
      .map(
        (_: any, i: number) =>
          `($${i * 10 + 1}, $${i * 10 + 2}, $${i * 10 + 3}, $${i * 10 + 4}, $${i * 10 + 5}, $${i * 10 + 6}, $${i * 10 + 7}, $${i * 10 + 8}, $${i * 10 + 9}, $${i * 10 + 10})`
      )
      .join(',');

    const flat = values.flat();

    await queryTx(
      client,
      `insert into checks (
        upload_id, service_id, slot_ts, status_code, is_valid,
        is_failed, latency_ms, agents, region, quality_flags
      ) values ${placeholders}`,
      flat
    );
  }
}

export async function insertRejectedRows(
  client: any,
  uploadId: string,
  rows: Array<{ line_no: number; raw: string; reason: string }>
): Promise<void> {
  for (const batch of batches(rows, 5000)) {
    const values = batch.map((r: any) => [uploadId, r.line_no, r.raw, r.reason]);
    const placeholders = values
      .map((_: any, i: number) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`)
      .join(',');
    const flat = values.flat();

    await queryTx(
      client,
      `insert into rejected_rows (upload_id, line_no, raw, reason) values ${placeholders}`,
      flat
    );
  }
}

export async function insertServices(
  client: any,
  uploadId: string,
  services: Array<{ service_id: string; service_name: string }>
): Promise<void> {
  for (const batch of batches(services, 5000)) {
    const values = batch.map((s: any) => [uploadId, s.service_id, s.service_name]);
    const placeholders = values
      .map((_: any, i: number) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
      .join(',');
    const flat = values.flat();

    await queryTx(
      client,
      `insert into services (upload_id, service_id, service_name) values ${placeholders}`,
      flat
    );
  }
}

export async function insertServiceStats(
  client: any,
  uploadId: string,
  stats: Array<{
    service_id: string;
    valid: number;
    failed: number;
    present: number;
    availability: number;
    downtime_min: number;
    p50_ms: number | null;
    p95_ms: number | null;
    incidents: number;
    longest_incident_min: number | null;
  }>
): Promise<void> {
  for (const batch of batches(stats, 5000)) {
    const values = batch.map((s: any) => [
      uploadId,
      s.service_id,
      s.valid,
      s.failed,
      s.present,
      s.availability,
      s.downtime_min,
      s.p50_ms,
      s.p95_ms,
      s.incidents,
      s.longest_incident_min,
    ]);

    const placeholders = values
      .map(
        (_: any, i: number) =>
          `($${i * 11 + 1}, $${i * 11 + 2}, $${i * 11 + 3}, $${i * 11 + 4}, $${i * 11 + 5}, $${i * 11 + 6}, $${i * 11 + 7}, $${i * 11 + 8}, $${i * 11 + 9}, $${i * 11 + 10}, $${i * 11 + 11})`
      )
      .join(',');

    const flat = values.flat();

    await queryTx(
      client,
      `insert into service_stats (
        upload_id, service_id, valid, failed, present, availability,
        downtime_min, p50_ms, p95_ms, incidents, longest_incident_min
      ) values ${placeholders}`,
      flat
    );
  }
}

export async function insertHourlyFailures(
  client: any,
  uploadId: string,
  rows: Array<{ service_id: string; hour_ts: string; checks: number; failed: number }>
): Promise<void> {
  for (const batch of batches(rows, 5000)) {
    const values = batch.map((r: any) => [uploadId, r.service_id, r.hour_ts, r.checks, r.failed]);
    const placeholders = values
      .map((_: any, i: number) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`)
      .join(',');
    const flat = values.flat();

    await queryTx(
      client,
      `insert into hourly_failures (upload_id, service_id, hour_ts, checks, failed) values ${placeholders}`,
      flat
    );
  }
}

export async function insertIncidents(
  client: any,
  uploadId: string,
  incidents: Array<{
    service_id: string;
    start_ts: string;
    end_ts: string;
    failed: number;
    median_latency_ms: number | null;
    normal_latency_ms: number | null;
  }>
): Promise<void> {
  for (const batch of batches(incidents, 5000)) {
    const values = batch.map((incident: any) => [
      uploadId,
      incident.service_id,
      incident.start_ts,
      incident.end_ts,
      incident.failed,
      incident.median_latency_ms,
      incident.normal_latency_ms,
    ]);

    const placeholders = values
      .map(
        (_: any, idx: number) =>
          `($${idx * 7 + 1}, $${idx * 7 + 2}, $${idx * 7 + 3}, $${idx * 7 + 4}, $${idx * 7 + 5}, $${idx * 7 + 6}, $${idx * 7 + 7})`
      )
      .join(',');

    const flat = values.flat();

    await queryTx(
      client,
      `insert into incidents (upload_id, service_id, start_ts, end_ts, failed, median_latency_ms, normal_latency_ms) values ${placeholders}`,
      flat
    );
  }
}

export async function getServiceStats(
  client: any,
  uploadId: string
): Promise<ServiceStat[]> {
  const result = await queryTx(
    client,
    'select * from service_stats where upload_id = $1 order by availability asc nulls last',
    [uploadId]
  );
  return result.rows as ServiceStat[];
}

export async function getIncidents(
  client: any,
  uploadId: string,
  { cursor, limit = 50 }: { cursor?: string; limit?: number } = {}
): Promise<{ rows: Incident[]; nextCursor?: string }> {
  const safeLimit = Math.min(limit, 100);
  let sql =
    'select * from incidents where upload_id = $1 order by start_ts desc limit $3';
  const params: any[] = [uploadId];

  if (cursor) {
    sql =
      'select * from incidents where upload_id = $1 and start_ts < (select start_ts from incidents where upload_id = $1 and start_ts = $2 limit 1) order by start_ts desc limit $3';
    params.push(cursor);
  }

  params.push(safeLimit + 1);

  const result = await queryTx(client, sql, params);
  const rows = (result.rows as Incident[]).slice(0, safeLimit);
  const hasMore = result.rows.length > safeLimit;
  const nextCursor = hasMore ? (result.rows[safeLimit] as Record<string, any>).start_ts : undefined;

  return { rows, nextCursor };
}

export async function getChecks(
  client: any,
  uploadId: string,
  {
    from,
    to,
    service,
    agent,
    region,
    status,
    cursor,
    limit = 10,
  }: {
    from?: string;
    to?: string;
    service?: string;
    agent?: string;
    region?: string | null;
    status?: string;
    cursor?: string;
    limit?: number;
  } = {}
): Promise<{ rows: Check[]; nextCursor?: string }> {
  const safeLimit = Math.min(limit, 100);
  let sql = 'select * from checks where upload_id = $1';
  const params: any[] = [uploadId];
  let paramCount = 2;

  if (from) {
    sql += ` and slot_ts >= $${paramCount}`;
    params.push(from);
    paramCount++;
  }

  if (to) {
    sql += ` and slot_ts <= $${paramCount}`;
    params.push(to);
    paramCount++;
  }

  if (service) {
    sql += ` and service_id = $${paramCount}`;
    params.push(service);
    paramCount++;
  }

  if (agent) {
    sql += ` and $${paramCount} = any(agents)`;
    params.push(agent);
    paramCount++;
  }

  if (region !== null && region !== undefined) {
    sql += ` and region = $${paramCount}`;
    params.push(region);
    paramCount++;
  }

  if (status) {
    sql += ` and status_code = $${paramCount}`;
    params.push(parseInt(status, 10));
    paramCount++;
  }

  if (cursor) {
    const cursorParts = cursor.split('|');
    const cursorTs = cursorParts[0];
    const cursorSvc = cursorParts[1];
    sql += ` and (slot_ts, service_id) < ($${paramCount}, $${paramCount + 1})`;
    params.push(cursorTs);
    params.push(cursorSvc);
    paramCount += 2;
  }

  sql += ` order by slot_ts desc, service_id desc limit $${paramCount}`;
  params.push(safeLimit + 1);

  const result = await queryTx(client, sql, params);
  const rows = (result.rows as Check[]).slice(0, safeLimit);
  const hasMore = result.rows.length > safeLimit;
  const nextCursor = hasMore
    ? `${(result.rows[safeLimit] as Record<string, any>).slot_ts}|${(result.rows[safeLimit] as Record<string, any>).service_id}`
    : undefined;

  return { rows, nextCursor };
}
