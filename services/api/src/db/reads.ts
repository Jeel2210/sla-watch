// Dashboard reads (GET /uploads/:id/…). Everything here reads values core computed at upload time;
// no business rule is re-applied in SQL (ADR-007).
import { AGENT_MULTI, type LogSort, type LogTab } from '@sla/core';
import type { Db } from './client';
import { pgTextArray } from './insert';
import type { UploadRow } from './queries';

// pg returns numeric as string and count(*) as bigint string; these read them back as numbers.
const num = (v: unknown) => Number(v);
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function getUpload(db: Db, id: string): Promise<UploadRow | undefined> {
  return (await db.query<UploadRow>('select * from uploads where id = $1', [id])).rows[0];
}

export async function serviceNames(db: Db, uploadId: string, limit: number): Promise<string[]> {
  const r = await db.query<{ service_name: string }>(
    'select service_name from services where upload_id = $1 order by service_id limit $2', [uploadId, limit]);
  return r.rows.map(x => x.service_name);
}

export async function serviceExists(db: Db, uploadId: string, serviceId: string): Promise<boolean> {
  return (await db.query('select 1 from services where upload_id = $1 and service_id = $2', [uploadId, serviceId])).rows.length > 0;
}

// ---------- stat strip ----------

export interface StatsRow {
  services: number;
  missed: number;
  incidents: number;
  allowedDowntimeMin: number;
  lowest: { serviceId: string; serviceName: string; availability: number } | null;
  longest: { serviceId: string; serviceName: string; minutes: number } | null;
}

export async function uploadStats(db: Db, uploadId: string): Promise<StatsRow> {
  const totals = (await db.query<{ services: string; missed: string; incidents: string; allowed: string | null }>(
    `select count(*) as services, count(*) filter (where met = false) as missed,
            coalesce(sum(incidents), 0) as incidents, max(allowed_downtime_min) as allowed
       from service_stats where upload_id = $1`, [uploadId])).rows[0]!;
  const lowest = (await db.query<{ service_id: string; service_name: string; availability: string }>(
    `select s.service_id, n.service_name, s.availability
       from service_stats s join services n using (upload_id, service_id)
      where s.upload_id = $1 and s.availability is not null
      order by s.availability, s.service_id limit 1`, [uploadId])).rows[0];
  const longest = (await db.query<{ service_id: string; service_name: string; minutes: string }>(
    `select i.service_id, n.service_name, extract(epoch from i.end_ts - i.start_ts) / 60 as minutes
       from incidents i join services n using (upload_id, service_id)
      where i.upload_id = $1
      order by i.end_ts - i.start_ts desc, i.start_ts, i.service_id limit 1`, [uploadId])).rows[0];
  return {
    services: num(totals.services),
    missed: num(totals.missed),
    incidents: num(totals.incidents),
    allowedDowntimeMin: num(totals.allowed ?? 0),
    lowest: lowest ? { serviceId: lowest.service_id, serviceName: lowest.service_name, availability: num(lowest.availability) } : null,
    longest: longest ? { serviceId: longest.service_id, serviceName: longest.service_name, minutes: Math.round(num(longest.minutes)) } : null,
  };
}

// ---------- services, worst first ----------

export interface ServiceStatRow {
  service_id: string;
  service_name: string;
  sort_key: string;            // coalesce(availability, 101): no-data services sort last
  availability: string | null;
  met: boolean | null;
  valid: number;
  failed: number;
  present: number;
  expected: number;
  downtime_min: number;
  allowed_downtime_min: string;
  times_allowance: string;
  incidents: number;
  longest_incident_min: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  coverage: string;
}

export const toServiceRow = (s: ServiceStatRow) => ({
  id: s.service_id,
  name: s.service_name,
  availability: numOrNull(s.availability),
  met: s.met,
  valid: s.valid,
  failed: s.failed,
  present: s.present,
  expected: s.expected,
  downtimeMin: s.downtime_min,
  allowedDowntimeMin: num(s.allowed_downtime_min),
  timesAllowance: num(s.times_allowance),
  incidents: s.incidents,
  longestIncidentMin: s.longest_incident_min,
  p50Ms: s.p50_ms,
  p95Ms: s.p95_ms,
  coverage: num(s.coverage),
});

const SERVICES_FROM = `
  from service_stats s join services n using (upload_id, service_id)
 where s.upload_id = $1 and ($2::text is null or n.service_name ilike $2 or s.service_id ilike $2)`;

/** Worst availability first. Keyset on (sort_key, service_id); the numeric key stays a string so no precision is lost. */
export async function listServices(
  db: Db, uploadId: string,
  opts: { limit: number; search?: string; after?: { sortKey: string; serviceId: string } },
): Promise<{ rows: ServiceStatRow[]; hasMore: boolean; total: number }> {
  const r = await db.query<ServiceStatRow>(
    `select s.*, n.service_name, coalesce(s.availability, 101) as sort_key ${SERVICES_FROM}
        and ($3::numeric is null or (coalesce(s.availability, 101), s.service_id) > ($3::numeric, $4::text))
      order by coalesce(s.availability, 101), s.service_id
      limit $5`,
    [uploadId, opts.search ?? null, opts.after?.sortKey ?? null, opts.after?.serviceId ?? null, opts.limit + 1]);
  const total = (await db.query<{ n: string }>(`select count(*) as n ${SERVICES_FROM}`, [uploadId, opts.search ?? null])).rows[0]!.n;
  return { rows: r.rows.slice(0, opts.limit), hasMore: r.rows.length > opts.limit, total: num(total) };
}

/** Services by position (the timeline pages by offset: it shows "services 11–20 of 50"). */
export async function servicesPage(db: Db, uploadId: string, offset: number, limit: number): Promise<{ rows: ServiceStatRow[]; total: number }> {
  const r = await db.query<ServiceStatRow>(
    `select s.*, n.service_name, coalesce(s.availability, 101) as sort_key ${SERVICES_FROM}
      order by coalesce(s.availability, 101), s.service_id
      offset $3 limit $4`, [uploadId, null, offset, limit]);
  const total = (await db.query<{ n: string }>(`select count(*) as n ${SERVICES_FROM}`, [uploadId, null])).rows[0]!.n;
  return { rows: r.rows, total: num(total) };
}

// ---------- hourly failures and incidents in a time window ----------

export async function hourlyInWindow(db: Db, uploadId: string, serviceId: string, from: string, to: string) {
  const r = await db.query<{ hour_ts: Date; checks: number; failed: number }>(
    `select hour_ts, checks, failed from hourly_failures
      where upload_id = $1 and service_id = $2 and hour_ts >= $3 and hour_ts < $4 order by hour_ts`,
    [uploadId, serviceId, from, to]);
  return r.rows.map(h => ({ hour: h.hour_ts.getTime(), checks: h.checks, failed: h.failed }));
}

/** Incidents overlapping [from, to), optionally for some services only. */
export async function incidentsInWindow(db: Db, uploadId: string, from: string, to: string, serviceIds?: string[]) {
  const r = await db.query<{ service_id: string; start_ts: Date; end_ts: Date }>(
    `select service_id, start_ts, end_ts from incidents
      where upload_id = $1 and end_ts > $2 and start_ts < $3 and ($4::text[] is null or service_id = any($4::text[]))
      order by start_ts`,
    [uploadId, from, to, serviceIds ? pgTextArray(serviceIds) : null]);
  return r.rows.map(i => ({ serviceId: i.service_id, start: i.start_ts.getTime(), end: i.end_ts.getTime() }));
}

/** Failed checks per service per bin (bin = floor((slot − start) / binMs)). */
export async function failedPerBin(db: Db, uploadId: string, serviceIds: string[], start: string, binMs: number) {
  const r = await db.query<{ service_id: string; bin: number; n: string }>(
    `select service_id, floor(extract(epoch from slot_ts - $3::timestamptz) * 1000 / $4)::int as bin, count(*) as n
       from checks
      where upload_id = $1 and is_failed and service_id = any($2::text[])
      group by 1, 2`,
    [uploadId, pgTextArray(serviceIds), start, binMs]);
  return r.rows.map(x => ({ serviceId: x.service_id, bin: x.bin, n: num(x.n) }));
}

// ---------- incidents list ----------

export interface IncidentListRow {
  service_id: string;
  service_name: string;
  start_ts: Date;
  end_ts: Date;
  failed: number;
  median_latency_ms: number | null;
  normal_latency_ms: number | null;
}

export async function listIncidents(
  db: Db, uploadId: string, opts: { limit: number; after?: { start: string; serviceId: string } },
): Promise<{ rows: IncidentListRow[]; hasMore: boolean }> {
  const r = await db.query<IncidentListRow>(
    `select i.service_id, n.service_name, i.start_ts, i.end_ts, i.failed, i.median_latency_ms, i.normal_latency_ms
       from incidents i join services n using (upload_id, service_id)
      where i.upload_id = $1 and ($2::timestamptz is null or (i.start_ts, i.service_id) > ($2::timestamptz, $3::text))
      order by i.start_ts, i.service_id
      limit $4`,
    [uploadId, opts.after?.start ?? null, opts.after?.serviceId ?? null, opts.limit + 1]);
  return { rows: r.rows.slice(0, opts.limit), hasMore: r.rows.length > opts.limit };
}

// ---------- logs ----------

export interface CheckFilters {
  from?: string;          // ISO, inclusive
  to?: string;            // ISO, exclusive
  service?: string;
  agent?: string;         // AGENT_MULTI = reported by 2+ agents
  region?: string;
}

export interface CheckListRow {
  slot_ts: Date;
  service_id: string;
  service_name: string;
  status_code: number;
  is_valid: boolean;
  is_failed: boolean;
  latency_ms: number | null;
  agents: string[];
  region: string | null;
  quality_flags: string[];
  rank: number;
}

/** Collects SQL conditions with numbered parameters. Only fixed fragments are added; values are always parameters. */
class Where {
  readonly conds: string[] = [];
  constructor(readonly params: unknown[]) {}
  add(fragment: (p: (value: unknown) => string) => string) {
    this.conds.push(fragment(value => { this.params.push(value); return `$${this.params.length}`; }));
    return this;
  }
  get sql() { return this.conds.join(' and '); }
}

function checkFilters(uploadId: string, f: CheckFilters): Where {
  const w = new Where([]).add(p => `c.upload_id = ${p(uploadId)}`);
  if (f.from) w.add(p => `c.slot_ts >= ${p(f.from)}`);
  if (f.to) w.add(p => `c.slot_ts < ${p(f.to)}`);
  if (f.service) w.add(p => `c.service_id = ${p(f.service)}`);
  if (f.agent === AGENT_MULTI) w.add(() => 'cardinality(c.agents) > 1');
  else if (f.agent) w.add(p => `${p(f.agent)} = any(c.agents)`);
  if (f.region) w.add(p => `c.region = ${p(f.region)}`);
  return w;
}

const TAB_SQL: Record<LogTab, string | null> = {
  all: null,
  failed: 'c.is_failed',
  changed: 'cardinality(c.quality_flags) > 0',
};

/** "Failures first" puts failed and invalid checks (the ones to look at) before the rest. */
const RANK_SQL = 'case when c.is_failed or not c.is_valid then 0 else 1 end';

/** Order and keyset per sort. The cursor holds the values of the last row, in this order. */
const SORTS: Record<LogSort, { order: string; key: string; cmp: '>' | '<'; cursor: (r: CheckListRow) => (string | number)[] }> = {
  old: { order: 'c.slot_ts, c.service_id', key: '(c.slot_ts, c.service_id)', cmp: '>', cursor: r => [r.slot_ts.toISOString(), r.service_id] },
  new: { order: 'c.slot_ts desc, c.service_id desc', key: '(c.slot_ts, c.service_id)', cmp: '<', cursor: r => [r.slot_ts.toISOString(), r.service_id] },
  fail: { order: `${RANK_SQL}, c.slot_ts, c.service_id`, key: `(${RANK_SQL}, c.slot_ts, c.service_id)`, cmp: '>', cursor: r => [r.rank, r.slot_ts.toISOString(), r.service_id] },
};

export const cursorArity = (sort: LogSort) => (sort === 'fail' ? 3 : 2);

export async function listChecks(
  db: Db, uploadId: string,
  opts: CheckFilters & { tab: LogTab; sort: LogSort; limit: number; after?: (string | number)[] },
): Promise<{ rows: CheckListRow[]; hasMore: boolean; nextCursor: (string | number)[] | null }> {
  const s = SORTS[opts.sort];
  const w = checkFilters(uploadId, opts);
  const tab = TAB_SQL[opts.tab];
  if (tab) w.add(() => tab);
  const after = opts.after;
  if (after) {
    w.add(p => opts.sort === 'fail'
      ? `${s.key} ${s.cmp} (${p(Number(after[0]))}::int, ${p(after[1])}::timestamptz, ${p(after[2])}::text)`
      : `${s.key} ${s.cmp} (${p(after[0])}::timestamptz, ${p(after[1])}::text)`);
  }
  const limitParam = w.params.push(opts.limit + 1);
  const text = `select c.slot_ts, c.service_id, n.service_name, c.status_code, c.is_valid, c.is_failed, c.latency_ms,
                       c.agents, c.region, c.quality_flags, ${RANK_SQL} as rank
                  from checks c join services n using (upload_id, service_id)
                 where ${w.sql}
                 order by ${s.order}
                 limit $${limitParam}`;
  const r = await db.query<CheckListRow>(text, w.params);
  const rows = r.rows.slice(0, opts.limit);
  const hasMore = r.rows.length > opts.limit;
  const last = rows[rows.length - 1];
  return { rows, hasMore, nextCursor: hasMore && last ? s.cursor(last) : null };
}

/** How many checks each tab would show for these filters. */
export async function checkCounts(db: Db, uploadId: string, f: CheckFilters): Promise<Record<LogTab, number>> {
  const w = checkFilters(uploadId, f);
  const text = `select count(*) as n_all, count(*) filter (where ${TAB_SQL.failed}) as failed,
                       count(*) filter (where ${TAB_SQL.changed}) as changed
                  from checks c where ${w.sql}`;
  const r = (await db.query<{ n_all: string; failed: string; changed: string }>(text, w.params)).rows[0]!;
  return { all: num(r.n_all), failed: num(r.failed), changed: num(r.changed) };
}
