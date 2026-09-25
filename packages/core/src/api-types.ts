// Response shapes of the HTTP API — the one contract shared by services/api (producer) and apps/web (consumer).
// Types only: nothing here runs.
import type { CleanErrorCode, CleanIssues, QualityFlag, RejectedRow } from './types';
import type { RowSummary } from './summary';

/** ISO 8601 UTC timestamp, e.g. "2025-04-06T00:00:00.000Z". */
export type IsoTime = string;

/** One page of a cursor-paged list. `nextCursor` is opaque; pass it back unchanged. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** An upload as listed in the sidebar and the All uploads table. */
export interface UploadSummary extends RowSummary {
  id: string;
  fileName: string;
  uploadedAt: IsoTime;
  rangeStart: IsoTime;    // first check slot
  rangeEnd: IsoTime;      // last check slot
  days: number;
  intervalMin: number;
  services: number;
  expectedChecks: number;
}

/** `POST /uploads` → 201 (new) or 200 (same file uploaded before, `duplicate: true`). */
export interface UploadCreated extends UploadSummary {
  duplicate: boolean;
  issues: CleanIssues;
  rejectedSample: RejectedRow[];   // first rejected rows, for the result screen
}

/** Every error response. 422 from the cleaner adds what the header was missing and what it had. */
export interface ApiErrorBody {
  error: string;
  requestId: string;
  code?: CleanErrorCode;
  missing?: string[];
  found?: string[];
}

// ---------- dashboard reads: GET /uploads/:id/… ----------

/** `GET /uploads/:id` — the upload plus what the data report shows. */
export interface UploadDetail extends UploadSummary {
  issues: CleanIssues;
  agents: string[];
  regions: string[];
  intervalHits: number | null;     // null for uploads stored before these were recorded
  totalGaps: number | null;
  serviceNames: string[];          // first few, by service id
  rejectedSample: RejectedRow[];
}

/** `GET /uploads/:id/stats` — the stat strip. */
export interface UploadStats {
  slaTarget: number;
  allowedDowntimeMin: number;      // per service, over the whole upload
  servicesTotal: number;
  missed: number;                  // services below the SLA target (credit eligible)
  incidents: number;
  longestIncident: { serviceId: string; serviceName: string; minutes: number } | null;
  lowest: { serviceId: string; serviceName: string; availability: number } | null;
}

/** One service with every per-service KPI (REQUIREMENTS.md → Per-service KPI list). */
export interface ServiceRow {
  id: string;
  name: string;
  availability: number | null;     // null: no valid checks
  met: boolean | null;
  valid: number;
  failed: number;
  present: number;
  expected: number;
  downtimeMin: number;
  allowedDowntimeMin: number;
  timesAllowance: number;
  incidents: number;
  longestIncidentMin: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  coverage: number;                // present ÷ expected × 100
}

/** `GET /uploads/:id/services?q&cursor&limit` — worst first; `total` counts every match. */
export interface ServicesPage extends Page<ServiceRow> { total: number }

export interface HexHour { checks: number; failed: number; incident: boolean }
/** One UTC day of one service: 24 hours. */
export interface HexDay { day: string; hours: HexHour[] }
/** `GET /uploads/:id/services/:sid/hex?from&days` — `from` is a day index (0 = first day of the upload). */
export interface HexPage { serviceId: string; totalDays: number; from: number; days: HexDay[] }

/** One service row of the timeline: failed checks per bin, incident bin ranges (inclusive). */
export interface TimelineRow {
  serviceId: string;
  name: string;
  availability: number | null;
  met: boolean | null;
  downtimeMin: number;
  timesAllowance: number;
  p95Ms: number | null;
  failed: number[];
  incidents: [number, number][];
}
/** `GET /uploads/:id/timeline?bins&offset&limit` — services worst first, a fixed number of bins per row. */
export interface TimelinePage {
  bins: number;
  binMin: number;
  rangeStart: IsoTime;
  offset: number;
  total: number;
  items: TimelineRow[];
}

/** `GET /uploads/:id/incidents?cursor&limit` — in time order. `end` is exclusive (last failed slot + interval). */
export interface IncidentRow {
  serviceId: string;
  serviceName: string;
  start: IsoTime;
  end: IsoTime;
  durationMin: number;
  failed: number;
  medianLatencyMs: number | null;
  normalLatencyMs: number | null;
}

export type LogTab = 'all' | 'failed' | 'changed';
export type LogSort = 'fail' | 'old' | 'new';

/** One stored check, as the logs table shows it. */
export interface CheckRow {
  slot: IsoTime;
  serviceId: string;
  serviceName: string;
  status: number;
  isValid: boolean;
  isFailed: boolean;
  latencyMs: number | null;
  agents: string[];
  region: string | null;
  flags: QualityFlag[];
}

/**
 * `GET /uploads/:id/checks?from&to&service&agent&region&tab&sort&cursor&limit` — `to` is exclusive.
 * `counts` (per tab, for the same filters) come with the first page only; `null` on later pages.
 */
export interface ChecksPage extends Page<CheckRow> {
  counts: Record<LogTab, number> | null;
}
