/** SLA availability target, in percent. */
export const SLA_TARGET = 99.9;
/** Rows per database write in the Lambda (ADR-011). */
export const BATCH_SIZE = 5_000;
/** Failures at most this many minutes apart belong to the same incident. */
export const INCIDENT_MAX_GAP_MIN = 60;
/** An incident needs at least this many failed checks in a row. */
export const INCIDENT_MIN_RUN = 2;
/** Used only when a file has too few rows to detect the check interval. */
export const DEFAULT_INTERVAL_MIN = 15;
export const REQUIRED_COLUMNS = ['service_id', 'service_name', 'timestamp', 'status_code', 'latency', 'latency_unit', 'agent'] as const;
/** Multiplier to milliseconds; keys are lower-case (units are read case-insensitively). */
export const LATENCY_UNITS: Readonly<Record<string, number>> = { ms: 1, s: 1000, us: 0.001, 'µs': 0.001 };
/** Upload limits (SECURITY.md T1): more data rows than this → TOO_MANY_ROWS. */
export const MAX_ROWS = 1_000_000;
/** Upload limits (SECURITY.md T1): a longer line is rejected, never parsed. */
export const MAX_LINE_CHARS = 4_096;
/** Largest CSV accepted, in bytes (SECURITY.md T1/T2): checked in the browser and as the Lambda's decompressed cap. */
export const MAX_FILE_BYTES = 50_000_000;
/**
 * Largest gzip body, in bytes. A Function URL invocation is capped at 6 MB and a binary body arrives
 * base64-encoded (4/3 larger), so ~4.4 MB of gzip is the most that reaches the Lambda.
 */
export const MAX_GZIP_BYTES = 4_400_000;
/** Field caps (SECURITY.md → Input validation): longer values reject the row, never truncated. */
export const MAX_ID_CHARS = 200;      // service_id, service_name
export const MAX_LABEL_CHARS = 100;   // agent, region
/** Logs filter value for "reported by 2 or more agents" (the `agent` query parameter). */
export const AGENT_MULTI = '*';
/** Most days one hex-map request may ask for (GET /uploads/:id/services/:sid/hex). */
export const HEX_MAX_DAYS = 31;
