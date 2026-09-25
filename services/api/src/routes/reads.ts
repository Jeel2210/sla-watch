// GET /uploads/:id/… — the dashboard reads. Thin: validate input → read → shape the response (ARCHITECTURE.md rule 3).
import {
  HEX_MAX_DAYS, SLA_TARGET,
  type ChecksPage, type HexDay, type HexPage, type IncidentRow, type LogSort, type LogTab, type ServicesPage,
  type TimelinePage, type UploadDetail, type UploadStats,
} from '@sla/core';
import { db } from '../db/client';
import { rejectedSample, toUploadSummary, type UploadRow } from '../db/queries';
import {
  checkCounts, cursorArity, failedPerBin, getUpload, hourlyInWindow, incidentsInWindow, listChecks, listIncidents,
  listServices, serviceExists, serviceNames, servicesPage, toServiceRow, uploadStats,
} from '../db/reads';
import { HttpError, type Reply, type Req } from '../lib/http';
import { decodeCursor, encodeCursor, enumParam, intParam, isoParam, likePattern, textParam, uuidParam } from '../lib/params';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const REPORT_SERVICE_NAMES = 8;
const REPORT_REJECTED = 20;
const LOG_TABS: readonly LogTab[] = ['all', 'failed', 'changed'];
const LOG_SORTS: readonly LogSort[] = ['fail', 'old', 'new'];

async function requireUpload(req: Req): Promise<UploadRow> {
  const upload = await getUpload(db, uuidParam(req.params.id, 'Upload'));
  if (!upload) throw new HttpError(404, 'Upload not found');
  return upload;
}

const ok = (body: unknown, uploadId: string): Reply => ({ status: 200, body, log: { uploadId } });

/** GET /uploads/:id — the upload and what the data report shows. */
export async function getUploadDetail(req: Req): Promise<Reply> {
  const u = await requireUpload(req);
  const body: UploadDetail = {
    ...toUploadSummary(u),
    issues: u.issues,
    agents: u.agents,
    regions: u.regions,
    intervalHits: u.interval_hits,
    totalGaps: u.total_gaps,
    serviceNames: await serviceNames(db, u.id, REPORT_SERVICE_NAMES),
    rejectedSample: await rejectedSample(db, u.id, REPORT_REJECTED),
  };
  return ok(body, u.id);
}

/** GET /uploads/:id/stats — the stat strip. */
export async function getStats(req: Req): Promise<Reply> {
  const u = await requireUpload(req);
  const s = await uploadStats(db, u.id);
  const body: UploadStats = {
    slaTarget: SLA_TARGET,
    allowedDowntimeMin: s.allowedDowntimeMin,
    servicesTotal: s.services,
    missed: s.missed,
    incidents: s.incidents,
    longestIncident: s.longest,
    lowest: s.lowest,
  };
  return ok(body, u.id);
}

/** GET /uploads/:id/services?q&cursor&limit — worst first, searched on the server (limit ≤ 20). */
export async function getServices(req: Req): Promise<Reply> {
  const u = await requireUpload(req);
  const limit = intParam(req.query.limit, 'limit', { fallback: 5, min: 1, max: 20 });
  const q = textParam(req.query.q, 'q');
  const cursor = decodeCursor(req.query.cursor, 2);
  const { rows, hasMore, total } = await listServices(db, u.id, {
    limit,
    search: q && likePattern(q),
    after: cursor && { sortKey: String(cursor[0]), serviceId: String(cursor[1]) },
  });
  const last = rows[rows.length - 1];
  const body: ServicesPage = {
    items: rows.map(toServiceRow),
    nextCursor: hasMore && last ? encodeCursor([last.sort_key, last.service_id]) : null,
    total,
  };
  return ok(body, u.id);
}

/** GET /uploads/:id/services/:sid/hex?from&days — hourly failures for a page of UTC days (days ≤ HEX_MAX_DAYS). */
export async function getHex(req: Req): Promise<Reply> {
  const u = await requireUpload(req);
  const serviceId = textParam(req.params.sid, 'service') ?? '';
  if (!(await serviceExists(db, u.id, serviceId))) throw new HttpError(404, 'Service not found');
  const firstDay = Math.floor(u.range_start.getTime() / DAY) * DAY;
  const totalDays = Math.floor(u.range_end.getTime() / DAY) - firstDay / DAY + 1;
  const from = intParam(req.query.from, 'from', { fallback: 0, min: 0, max: totalDays - 1 });
  const count = Math.min(intParam(req.query.days, 'days', { fallback: 7, min: 1, max: HEX_MAX_DAYS }), totalDays - from);
  const start = firstDay + from * DAY;
  const end = start + count * DAY;
  const [hourly, incidents] = await Promise.all([
    hourlyInWindow(db, u.id, serviceId, new Date(start).toISOString(), new Date(end).toISOString()),
    incidentsInWindow(db, u.id, new Date(start).toISOString(), new Date(end).toISOString(), [serviceId]),
  ]);
  const byHour = new Map(hourly.map(h => [h.hour, h]));
  const days: HexDay[] = [];
  for (let d = 0; d < count; d++) {
    const dayStart = start + d * DAY;
    days.push({
      day: new Date(dayStart).toISOString().slice(0, 10),
      hours: Array.from({ length: 24 }, (_, h) => {
        const hour = dayStart + h * HOUR;
        const row = byHour.get(hour);
        return {
          checks: row?.checks ?? 0,
          failed: row?.failed ?? 0,
          incident: incidents.some(i => i.start < hour + HOUR && i.end > hour),
        };
      }),
    });
  }
  const body: HexPage = { serviceId, totalDays, from, days };
  return ok(body, u.id);
}

/** GET /uploads/:id/timeline?bins&offset&limit — failed checks per bin for a page of services, worst first. */
export async function getTimeline(req: Req): Promise<Reply> {
  const u = await requireUpload(req);
  const wanted = intParam(req.query.bins, 'bins', { fallback: 240, min: 10, max: 1000 });
  const offset = intParam(req.query.offset, 'offset', { fallback: 0, min: 0, max: 1_000_000 });
  const limit = intParam(req.query.limit, 'limit', { fallback: 10, min: 1, max: 20 });
  const start = u.range_start.getTime();
  const span = u.range_end.getTime() - start + u.interval_min * 60_000;
  const binMs = Math.ceil(span / wanted / 60_000) * 60_000;       // whole minutes
  const bins = Math.ceil(span / binMs);
  const binOf = (ms: number) => Math.min(bins - 1, Math.max(0, Math.floor((ms - start) / binMs)));

  const { rows, total } = await servicesPage(db, u.id, offset, limit);
  const ids = rows.map(r => r.service_id);
  const startIso = u.range_start.toISOString();
  const endIso = new Date(start + span).toISOString();
  const [failed, incidents] = ids.length
    ? await Promise.all([failedPerBin(db, u.id, ids, startIso, binMs), incidentsInWindow(db, u.id, startIso, endIso, ids)])
    : [[], []];

  const body: TimelinePage = {
    bins,
    binMin: binMs / 60_000,
    rangeStart: startIso,
    offset,
    total,
    items: rows.map(r => {
      const perBin = new Array<number>(bins).fill(0);
      for (const f of failed) {
        if (f.serviceId !== r.service_id) continue;
        const b = Math.min(bins - 1, Math.max(0, f.bin));
        perBin[b] = (perBin[b] ?? 0) + f.n;
      }
      const s = toServiceRow(r);
      return {
        serviceId: s.id, name: s.name, availability: s.availability, met: s.met,
        downtimeMin: s.downtimeMin, timesAllowance: s.timesAllowance, p95Ms: s.p95Ms,
        failed: perBin,
        incidents: incidents.filter(i => i.serviceId === r.service_id).map(i => [binOf(i.start), binOf(i.end - 1)] as [number, number]),
      };
    }),
  };
  return ok(body, u.id);
}

/** GET /uploads/:id/incidents?cursor&limit — in time order (limit ≤ 50). */
export async function getIncidents(req: Req): Promise<Reply> {
  const u = await requireUpload(req);
  const limit = intParam(req.query.limit, 'limit', { fallback: 50, min: 1, max: 50 });
  const cursor = decodeCursor(req.query.cursor, 2);
  const { rows, hasMore } = await listIncidents(db, u.id, {
    limit,
    after: cursor && { start: String(cursor[0]), serviceId: String(cursor[1]) },
  });
  const last = rows[rows.length - 1];
  const items: IncidentRow[] = rows.map(i => ({
    serviceId: i.service_id,
    serviceName: i.service_name,
    start: i.start_ts.toISOString(),
    end: i.end_ts.toISOString(),
    durationMin: Math.round((i.end_ts.getTime() - i.start_ts.getTime()) / 60_000),
    failed: i.failed,
    medianLatencyMs: i.median_latency_ms,
    normalLatencyMs: i.normal_latency_ms,
  }));
  return ok({ items, nextCursor: hasMore && last ? encodeCursor([last.start_ts.toISOString(), last.service_id]) : null }, u.id);
}

/** GET /uploads/:id/checks?from&to&service&agent&region&tab&sort&cursor&limit — the logs (limit ≤ 50). */
export async function getChecks(req: Req): Promise<Reply> {
  const u = await requireUpload(req);
  const q = req.query;
  const filters = {
    from: isoParam(q.from, 'from'),
    to: isoParam(q.to, 'to'),
    service: textParam(q.service, 'service'),
    agent: textParam(q.agent, 'agent', 100),
    region: textParam(q.region, 'region', 100),
  };
  if (filters.from && filters.to && filters.from >= filters.to) throw new HttpError(400, 'from must be before to');
  const tab = enumParam(q.tab, 'tab', LOG_TABS, 'all');
  const sort = enumParam(q.sort, 'sort', LOG_SORTS, 'fail');
  const limit = intParam(q.limit, 'limit', { fallback: 10, min: 1, max: 50 });
  const after = decodeCursor(q.cursor, cursorArity(sort));
  const [page, counts] = await Promise.all([
    listChecks(db, u.id, { ...filters, tab, sort, limit, after }),
    after ? Promise.resolve(null) : checkCounts(db, u.id, filters),
  ]);
  const body: ChecksPage = {
    items: page.rows.map(c => ({
      slot: c.slot_ts.toISOString(),
      serviceId: c.service_id,
      serviceName: c.service_name,
      status: c.status_code,
      isValid: c.is_valid,
      isFailed: c.is_failed,
      latencyMs: c.latency_ms,
      agents: c.agents,
      region: c.region,
      flags: c.quality_flags as ChecksPage['items'][number]['flags'],
    })),
    nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
    counts,
  };
  return { status: 200, body, log: { uploadId: u.id, rows: body.items.length } };
}
