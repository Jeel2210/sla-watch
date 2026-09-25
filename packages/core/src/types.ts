export type QualityFlag =
  | 'epoch_ts' | 'offset_ts' | 'unit_converted' | 'merged'
  | 'latency_missing' | 'latency_negative' | 'invalid_status' | 'snapped';

/** One cleaned check: one service at one interval slot. */
export interface Check {
  serviceId: string;
  slot: number;            // UTC ms, start of the slot
  status: number;          // -1 when the status text was not a number
  isValid: boolean;        // status within 100–599
  isFailed: boolean;       // valid and 500–599
  latencyMs: number | null;
  agents: string[];        // sorted, unique
  region: string | null;
  flags: QualityFlag[];    // sorted
}

export interface RejectedRow { line: number; raw: string; reason: string }

export interface CleanIssues {
  exactDuplicates: number;
  epoch: number;
  offset: number;
  offsets: Record<string, number>;          // e.g. { "+05:30": 109 }
  unitConverted: Record<string, number>;    // e.g. { s: 3090 }
  unitCase: number;                          // "S", "MS" read as "s", "ms"
  trimmed: number;                           // rows with padded fields
  latencyMissing: number;
  latencyNegative: number;
  invalidStatus: number;
  status4xx: number;
  snapped: number;
  mergedRows: number;                        // rows folded into another row's check
}

export interface CleanOk {
  ok: true;
  services: { id: string; name: string }[];  // sorted by id
  checks: Check[];                            // sorted by slot, then serviceId
  rejected: RejectedRow[];
  intervalMin: number;
  intervalHits: number;                       // gaps equal to the interval
  totalGaps: number;                          // all gaps looked at
  rangeStart: number;                         // first slot (UTC ms)
  rangeEnd: number;                           // last slot (UTC ms)
  days: number;
  expectedChecks: number;                     // services × slots
  gaps: number;                               // expectedChecks − checks.length
  rowsTotal: number;                          // non-empty data lines
  issues: CleanIssues;
  agents: string[];
  regions: string[];
}

export type CleanErrorCode = 'EMPTY' | 'MISSING_COLUMNS' | 'NO_READABLE_ROWS' | 'TOO_MANY_ROWS';
export interface CleanError {
  ok: false;
  code: CleanErrorCode;
  message: string;
  found: string[];
  missing?: string[];
  rejected?: RejectedRow[];
}
export type CleanResult = CleanOk | CleanError;

export interface ServiceStat {
  serviceId: string;
  valid: number;
  failed: number;
  present: number;                 // checks stored (valid + invalid)
  expected: number;                // slots in the upload
  availability: number | null;     // null when there are no valid checks
  met: boolean | null;
  downtimeMin: number;
  allowedDowntimeMin: number;
  timesAllowance: number;          // downtime ÷ allowed
  p50Ms: number | null;
  p95Ms: number | null;
  coverage: number;                // present ÷ expected × 100
}

export interface Incident {
  serviceId: string;
  start: number;                   // first failed slot (UTC ms)
  end: number;                     // last failed slot + interval (exclusive)
  failedChecks: number;
  medianLatencyMs: number | null;  // inside the window
  normalLatencyMs: number | null;  // same service, successful checks outside incidents
}

export interface HourlyFailure {
  serviceId: string;
  hour: number;                    // UTC ms, start of the hour
  checks: number;
  failed: number;
}
