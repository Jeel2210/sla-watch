# Core Package (cleaning · SLA · incidents) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/core` — a pure TypeScript package that turns a raw monitoring CSV into clean checks, per-service SLA stats, incidents and hourly failure counts, proven on the 5 sample files and the stress files.

**Architecture:** Pure functions only (string in → objects out; no I/O, no framework). `cleanCsv` parses, validates, normalises and merges rows into one `Check` per service per slot; `serviceStats`, `detectIncidents` and `hourlyFailures` derive everything the API and dashboard need. Tests read the real CSVs from `data/` and assert exact counts.

**Tech Stack:** Node 20, TypeScript 5 (`strict`), npm workspaces, Vitest.

**Spec:** `.claude/product-requirement/REQUIREMENTS.md` (business rules, acceptance), `.claude/architecture/ARCHITECTURE.md` (folder structure, ADRs), `.claude/rules/RULES.md` (coding rules). Plan 1 of 3 — next: *API (Lambda + Neon + SAM)*, then *Web (React dashboard)*.

## Global Constraints

- TypeScript `strict: true`; no `any`.
- `packages/core/src` imports nothing outside the standard library — no `fs`, network, React or AWS (tests may use `fs`).
- All times are UTC milliseconds (`number`); never local time.
- Failed check = status **500–599**. 4xx = up. Status outside **100–599** (e.g. `999`) = invalid, excluded from availability.
- Merge per service + slot: a valid failure wins; a valid status beats an invalid one; keep the first usable latency.
- Availability = (valid − failed) ÷ valid × 100. Downtime = failed × interval. Allowed = expected slots × interval × (100 − 99.9)/100.
- Incident = failures ≤ 60 min apart grouped, counted when ≥ 2 checks in a row failed. Never changes SLA numbers.
- Gaps (missing slots) are "no data", never downtime.
- Never assume days, services, agents, regions or the interval — detect them.
- No `Math.max(...array)` / `Math.min(...array)` on data arrays (stack overflow at ~100k items) — use loops.
- Constants live only in `src/constants.ts`.
- Batch processing (ADR-011): anything written to the database is split with `batches(items, BATCH_SIZE)`; `BATCH_SIZE = 5_000`.
- Upload limits (SECURITY.md T1): ≤ `MAX_ROWS = 1_000_000` data rows (else `TOO_MANY_ROWS`); a line over `MAX_LINE_CHARS = 4_096` is rejected unparsed; a row whose service id/name is over `MAX_ID_CHARS = 200` or agent/region over `MAX_LABEL_CHARS = 100` is rejected with a reason (never truncated). Byte/gzip limits (6 MB body, 50 MB decompressed) belong to the Lambda (Plan 2).
- `packages/core` never calls `Date.now()` (rules.js core-purity) — tests time with `performance.now()`.
- Commit after every task: `core: …`, lower-case, no trailing period, ≤ 72 chars (`scripts/checks/commit-msg.js`). Never `--no-verify`.

## Review Focus

These inputs are implied by "users upload a CSV" but no sample file contains them; each has a test in the task that owns the code:

1. **UTF-8 BOM before the header** (Excel exports) → header still recognised, not "missing columns". *(Task 4, test `strips a UTF-8 BOM`)*
2. **Quoted fields containing commas** (`"payments, eu"`) → field kept whole, row accepted. *(Task 2, test `keeps commas inside quotes`)*
3. **Header in a different order / upper case / with extra columns** → mapped by name, extras ignored. *(Task 4, test `maps columns by name, case-insensitive, ignores extras`)*
4. **File with only a header, or where every row is unreadable** → clear error codes `EMPTY` / `NO_READABLE_ROWS`, rejected rows listed. *(Task 4, tests `EMPTY` and `NO_READABLE_ROWS`)*
5. **Timestamps without seconds or with milliseconds** (`2025-04-06T00:00Z`, `…00:00.000+05:30`) → parsed to the same UTC instant. *(Task 3, test `accepts minutes-only and milliseconds`)*

---

## File Structure

```
package.json                        npm workspaces root (create)
tsconfig.base.json                  shared strict compiler options (create)
packages/core/
  package.json                      @sla/core, scripts: test, typecheck
  tsconfig.json
  src/
    constants.ts                    every tunable number/string
    types.ts                        Check, CleanResult, ServiceStat, Incident, HourlyFailure …
    csv.ts                          splitCsvLine() — quoted-field aware
    timestamp.ts                    parseTimestamp()
    row.ts                          parseRow() — one line → ParsedRow or reason
    clean.ts                        cleanCsv() — the whole cleaning pipeline
    sla.ts                          percentile(), serviceStats()
    incidents.ts                    detectIncidents()
    hourly.ts                       hourlyFailures()
    batch.ts                        batches() — fixed-size chunks for Lambda writes
    index.ts                        public exports
  test/
    helpers.ts                      readSample(), readStress(), hasStress()
    csv.test.ts  timestamp.test.ts  row.test.ts  clean.test.ts
    samples.test.ts                 exact counts on the 5 sample files
    sla.test.ts  incidents.test.ts  hourly.test.ts  batch.test.ts
    stress.test.ts                  stress_small / chaos / large (skipped if not generated)
```

---

### Task 1: Workspace, constants and types

**Files:**
- Create: `package.json`, `tsconfig.base.json`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/core/src/constants.ts`, `packages/core/src/types.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/constants.test.ts`

**Interfaces:**
- Produces: `SLA_TARGET`, `BATCH_SIZE`, `INCIDENT_MAX_GAP_MIN`, `INCIDENT_MIN_RUN`, `DEFAULT_INTERVAL_MIN`, `REQUIRED_COLUMNS`, `LATENCY_UNITS`, `MAX_ROWS`, `MAX_LINE_CHARS`, `MAX_ID_CHARS`, `MAX_LABEL_CHARS`; all types in `types.ts` (used by every later task).

- [ ] **Step 1: Create the workspace root**

`package.json`
```json
{
  "name": "sla-watch",
  "private": true,
  "workspaces": ["packages/*", "services/*", "apps/*"],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "prepare": "git config core.hooksPath .githooks"
  },
  "engines": { "node": ">=20" }
}
```

`tsconfig.base.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true
  }
}
```

`packages/core/package.json`
```json
{
  "name": "@sla/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

`packages/core/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"], "noEmit": true },
  "include": ["src", "test"]
}
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Write the failing test**

`packages/core/test/constants.test.ts`
```ts
import { describe, expect, it } from 'vitest';
import { BATCH_SIZE, LATENCY_UNITS, REQUIRED_COLUMNS, SLA_TARGET } from '../src/index';

describe('constants', () => {
  it('holds the SLA target and required columns from the spec', () => {
    expect(SLA_TARGET).toBe(99.9);
    expect(BATCH_SIZE).toBe(5_000);
    expect(REQUIRED_COLUMNS).toEqual(['service_id', 'service_name', 'timestamp', 'status_code', 'latency', 'latency_unit', 'agent']);
    expect(LATENCY_UNITS.s).toBe(1000);
    expect(LATENCY_UNITS.ms).toBe(1);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -w @sla/core -- test/constants.test.ts`
Expected: FAIL — cannot find module `../src/index`.

- [ ] **Step 5: Write constants, types and index**

`packages/core/src/constants.ts`
```ts
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
/** Field caps (SECURITY.md → Input validation): longer values reject the row, never truncated. */
export const MAX_ID_CHARS = 200;      // service_id, service_name
export const MAX_LABEL_CHARS = 100;   // agent, region
```

`packages/core/src/types.ts`
```ts
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
```

`packages/core/src/index.ts`
```ts
export * from './constants';
export * from './types';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -w @sla/core -- test/constants.test.ts` → PASS
Run: `npm run typecheck -w @sla/core` → no errors

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json packages/core
git commit -m "core: workspace, constants and shared types"
```

---

### Task 2: CSV line splitting

**Files:**
- Create: `packages/core/src/csv.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/csv.test.ts`

**Interfaces:**
- Produces: `splitCsvLine(line: string): string[]`

- [ ] **Step 1: Write the failing test**

`packages/core/test/csv.test.ts`
```ts
import { describe, expect, it } from 'vitest';
import { splitCsvLine } from '../src/index';

describe('splitCsvLine', () => {
  it('splits a plain line', () => {
    expect(splitCsvLine('svc-a,a-api,2025-04-06T00:00:00Z,200,12,ms,agent-1,ap-south-1'))
      .toEqual(['svc-a', 'a-api', '2025-04-06T00:00:00Z', '200', '12', 'ms', 'agent-1', 'ap-south-1']);
  });
  it('keeps empty fields', () => {
    expect(splitCsvLine('a,,c,')).toEqual(['a', '', 'c', '']);
  });
  it('keeps commas inside quotes', () => {
    expect(splitCsvLine('svc-a,"payments, eu",x')).toEqual(['svc-a', 'payments, eu', 'x']);
  });
  it('unescapes doubled quotes', () => {
    expect(splitCsvLine('"say ""hi""",b')).toEqual(['say "hi"', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @sla/core -- test/csv.test.ts`
Expected: FAIL — `splitCsvLine` is not exported.

- [ ] **Step 3: Implement**

`packages/core/src/csv.ts`
```ts
/** Split one CSV line. Fast path for lines without quotes; RFC 4180 quoting otherwise. */
export function splitCsvLine(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './csv';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @sla/core -- test/csv.test.ts` → PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/csv.ts packages/core/src/index.ts packages/core/test/csv.test.ts
git commit -m "core: quoted-field aware CSV line splitting"
```

---

### Task 3: Timestamp parsing

**Files:**
- Create: `packages/core/src/timestamp.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/timestamp.test.ts`

**Interfaces:**
- Produces: `type TsKind = 'iso_utc' | 'iso_offset' | 'epoch'`; `interface ParsedTs { ms: number; kind: TsKind; offset: string | null }`; `parseTimestamp(raw: string): ParsedTs | null`

- [ ] **Step 1: Write the failing test**

`packages/core/test/timestamp.test.ts`
```ts
import { describe, expect, it } from 'vitest';
import { parseTimestamp } from '../src/index';

const UTC = Date.UTC(2025, 3, 6, 0, 15); // 2025-04-06T00:15:00Z

describe('parseTimestamp', () => {
  it('reads ISO UTC', () => {
    expect(parseTimestamp('2025-04-06T00:15:00Z')).toEqual({ ms: UTC, kind: 'iso_utc', offset: null });
  });
  it('converts a +05:30 offset to UTC', () => {
    expect(parseTimestamp('2025-04-06T05:45:00+05:30')).toEqual({ ms: UTC, kind: 'iso_offset', offset: '+05:30' });
  });
  it('reads epoch seconds and milliseconds', () => {
    expect(parseTimestamp(String(UTC / 1000))).toEqual({ ms: UTC, kind: 'epoch', offset: null });
    expect(parseTimestamp(String(UTC))).toEqual({ ms: UTC, kind: 'epoch', offset: null });
  });
  it('accepts minutes-only and milliseconds', () => {
    expect(parseTimestamp('2025-04-06T00:15Z')?.ms).toBe(UTC);
    expect(parseTimestamp('2025-04-06T05:45:00.000+05:30')?.ms).toBe(UTC);
  });
  it('trims surrounding spaces', () => {
    expect(parseTimestamp('  2025-04-06T00:15:00Z ')?.ms).toBe(UTC);
  });
  it('rejects anything else', () => {
    for (const bad of ['13/05/2025 16:00', '2025-04-06 00:15:00', '2025-04-06T00:15:00', '12345', '', 'tomorrow']) {
      expect(parseTimestamp(bad)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @sla/core -- test/timestamp.test.ts`
Expected: FAIL — `parseTimestamp` is not exported.

- [ ] **Step 3: Implement**

`packages/core/src/timestamp.ts`
```ts
export type TsKind = 'iso_utc' | 'iso_offset' | 'epoch';
export interface ParsedTs { ms: number; kind: TsKind; offset: string | null }

// A timezone is required: a timestamp without Z or ±hh:mm is ambiguous, so it is rejected.
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/;

export function parseTimestamp(raw: string): ParsedTs | null {
  const t = raw.trim();
  if (/^\d{10}$/.test(t)) return { ms: Number(t) * 1000, kind: 'epoch', offset: null };
  if (/^\d{13}$/.test(t)) return { ms: Number(t), kind: 'epoch', offset: null };
  const m = ISO.exec(t);
  if (!m) return null;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  const zone = m[3] ?? 'Z';
  return zone === 'Z' ? { ms, kind: 'iso_utc', offset: null } : { ms, kind: 'iso_offset', offset: zone };
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './timestamp';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @sla/core -- test/timestamp.test.ts` → PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/timestamp.ts packages/core/src/index.ts packages/core/test/timestamp.test.ts
git commit -m "core: parse ISO (any offset) and epoch timestamps to UTC"
```

---

### Task 4: Row parsing and the cleaning pipeline

**Files:**
- Create: `packages/core/src/row.ts`, `packages/core/src/clean.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/row.test.ts`, `packages/core/test/clean.test.ts`

**Interfaces:**
- Consumes: `splitCsvLine`, `parseTimestamp`, `TsKind`, constants, types.
- Produces:
  - `interface ParsedRow { serviceId: string; serviceName: string; ms: number; tsKind: TsKind; tsOffset: string | null; status: number; statusValid: boolean; latencyMs: number | null; latencyIssue: 'missing' | 'negative' | null; unit: string | null; unitCaseFixed: boolean; agent: string; region: string | null; trimmed: boolean }`
  - `parseRow(fields: string[], col: Record<string, number>, columnCount: number): { ok: true; row: ParsedRow } | { ok: false; reason: string }`
  - `detectInterval(rows: { serviceId: string; ms: number }[]): { intervalMs: number; hits: number; totalGaps: number }`
  - `cleanCsv(text: string): CleanResult`

- [ ] **Step 1: Write the failing row tests**

`packages/core/test/row.test.ts`
```ts
import { describe, expect, it } from 'vitest';
import { parseRow, splitCsvLine } from '../src/index';

const HEADER = 'service_id,service_name,timestamp,status_code,latency,latency_unit,agent,region'.split(',');
const COL = Object.fromEntries(HEADER.map((h, i) => [h, i]));
const row = (line: string) => parseRow(splitCsvLine(line), COL, HEADER.length);

describe('parseRow', () => {
  it('reads a clean row', () => {
    const r = row('svc-a,a-api,2025-04-06T00:15:00Z,200,110,ms,agent-1,ap-south-1');
    expect(r).toEqual({ ok: true, row: {
      serviceId: 'svc-a', serviceName: 'a-api', ms: Date.UTC(2025, 3, 6, 0, 15), tsKind: 'iso_utc', tsOffset: null,
      status: 200, statusValid: true, latencyMs: 110, latencyIssue: null, unit: 'ms', unitCaseFixed: false,
      agent: 'agent-1', region: 'ap-south-1', trimmed: false } });
  });
  it('converts seconds and reads units case-insensitively', () => {
    const r = row('svc-a,a-api,2025-04-06T00:15:00Z,200,0.486,S,agent-1,ap-south-1');
    expect(r.ok && r.row.latencyMs).toBe(486);
    expect(r.ok && r.row.unit).toBe('s');
    expect(r.ok && r.row.unitCaseFixed).toBe(true);
  });
  it('keeps the check when latency is blank or negative', () => {
    const blank = row('svc-a,a-api,2025-04-06T00:15:00Z,503,,ms,agent-1,ap-south-1');
    expect(blank.ok && [blank.row.latencyMs, blank.row.latencyIssue]).toEqual([null, 'missing']);
    const neg = row('svc-a,a-api,2025-04-06T00:15:00Z,200,-286,ms,agent-1,ap-south-1');
    expect(neg.ok && [neg.row.latencyMs, neg.row.latencyIssue]).toEqual([null, 'negative']);
  });
  it('marks 999 as an invalid status but keeps the row', () => {
    const r = row('svc-a,a-api,2025-04-06T00:15:00Z,999,120,ms,agent-1,ap-south-1');
    expect(r.ok && r.row.statusValid).toBe(false);
  });
  it('trims padded fields and records it', () => {
    const r = row(' svc-a , a-api ,2025-04-06T00:15:00Z,200,12,ms,agent-1,ap-south-1');
    expect(r.ok && [r.row.serviceId, r.row.serviceName, r.row.trimmed]).toEqual(['svc-a', 'a-api', true]);
  });
  it('rejects unreadable rows with a reason', () => {
    expect(row('svc-a,a-api,13/05/2025 16:00,200,12,ms,agent-1,ap-south-1'))
      .toEqual({ ok: false, reason: 'Unrecognised timestamp "13/05/2025 16:00"' });
    expect(row('svc-a,a-api,2025-04-06T00:15:00Z,200,12,sec,agent-1,ap-south-1'))
      .toEqual({ ok: false, reason: 'Unknown latency unit "sec"' });
    expect(row('svc-a,a-api,2025-04-06T00:15:00Z,200'))
      .toEqual({ ok: false, reason: 'Only 4 of 8 columns' });
    expect(row(',a-api,2025-04-06T00:15:00Z,200,12,ms,agent-1,ap-south-1'))
      .toEqual({ ok: false, reason: 'Empty service_id' });
  });
  it('rejects over-long fields instead of truncating them', () => {
    expect(row(`${'s'.repeat(201)},a-api,2025-04-06T00:15:00Z,200,12,ms,agent-1,ap-south-1`))
      .toEqual({ ok: false, reason: 'service_id is longer than 200 characters' });
    expect(row(`svc-a,a-api,2025-04-06T00:15:00Z,200,12,ms,${'a'.repeat(101)},ap-south-1`))
      .toEqual({ ok: false, reason: 'agent is longer than 100 characters' });
    expect(row(`svc-a,${'n'.repeat(200)},2025-04-06T00:15:00Z,200,12,ms,agent-1,${'r'.repeat(100)}`).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @sla/core -- test/row.test.ts`
Expected: FAIL — `parseRow` is not exported.

- [ ] **Step 3: Implement `row.ts`**

`packages/core/src/row.ts`
```ts
import { LATENCY_UNITS, MAX_ID_CHARS, MAX_LABEL_CHARS } from './constants';
import { parseTimestamp, type TsKind } from './timestamp';

export interface ParsedRow {
  serviceId: string;
  serviceName: string;
  ms: number;
  tsKind: TsKind;
  tsOffset: string | null;
  status: number;
  statusValid: boolean;
  latencyMs: number | null;
  latencyIssue: 'missing' | 'negative' | null;
  unit: string | null;          // lower-case unit, only when a latency value is present
  unitCaseFixed: boolean;
  agent: string;
  region: string | null;
  trimmed: boolean;
}
export type RowResult = { ok: true; row: ParsedRow } | { ok: false; reason: string };

export function parseRow(fields: string[], col: Record<string, number>, columnCount: number): RowResult {
  if (fields.length < columnCount) return { ok: false, reason: `Only ${fields.length} of ${columnCount} columns` };
  const get = (name: string): string => {
    const i = col[name];
    return i === undefined ? '' : (fields[i] ?? '').trim();
  };
  const trimmed = fields.some(f => f !== f.trim());

  const serviceId = get('service_id');
  if (!serviceId) return { ok: false, reason: 'Empty service_id' };
  const caps: [string, number][] = [['service_id', MAX_ID_CHARS], ['service_name', MAX_ID_CHARS], ['agent', MAX_LABEL_CHARS], ['region', MAX_LABEL_CHARS]];
  for (const [name, max] of caps) {
    if (get(name).length > max) return { ok: false, reason: `${name} is longer than ${max} characters` };
  }

  const tsText = get('timestamp');
  const ts = parseTimestamp(tsText);
  if (!ts) return { ok: false, reason: `Unrecognised timestamp "${tsText}"` };

  const latText = get('latency');
  const unitRaw = get('latency_unit');
  const unitLower = unitRaw.toLowerCase();
  let latencyMs: number | null = null;
  let latencyIssue: ParsedRow['latencyIssue'] = null;
  let unit: string | null = null;
  let unitCaseFixed = false;
  if (latText === '') {
    latencyIssue = 'missing';
  } else {
    const factor = LATENCY_UNITS[unitLower];
    if (factor === undefined) return { ok: false, reason: `Unknown latency unit "${unitRaw}"` };
    const value = Number(latText) * factor;
    if (Number.isNaN(value)) return { ok: false, reason: `Latency is not a number "${latText}"` };
    unit = unitLower;
    unitCaseFixed = unitLower !== unitRaw;
    if (value < 0) latencyIssue = 'negative';
    else latencyMs = Math.round(value);
  }

  const statusText = get('status_code');
  const parsedStatus = Number(statusText);
  const status = statusText !== '' && Number.isFinite(parsedStatus) ? parsedStatus : -1;
  const statusValid = Number.isInteger(status) && status >= 100 && status <= 599;

  return { ok: true, row: {
    serviceId, serviceName: get('service_name'), ms: ts.ms, tsKind: ts.kind, tsOffset: ts.offset,
    status, statusValid, latencyMs, latencyIssue, unit, unitCaseFixed,
    agent: get('agent') || 'unknown', region: get('region') || null, trimmed,
  } };
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './row';
```

- [ ] **Step 4: Run to verify row tests pass**

Run: `npm test -w @sla/core -- test/row.test.ts` → PASS (7 tests)

- [ ] **Step 5: Write the failing pipeline tests**

`packages/core/test/clean.test.ts`
```ts
import { describe, expect, it } from 'vitest';
import { cleanCsv, MAX_LINE_CHARS, type CleanOk } from '../src/index';

const H = 'service_id,service_name,timestamp,status_code,latency,latency_unit,agent,region';
const ok = (text: string): CleanOk => {
  const r = cleanCsv(text);
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.message}`);
  return r;
};
// two services × three 15-minute slots
const BASE = [H,
  'svc-a,a-api,2025-04-06T00:00:00Z,200,100,ms,agent-1,ap-south-1',
  'svc-a,a-api,2025-04-06T00:15:00Z,200,110,ms,agent-1,ap-south-1',
  'svc-a,a-api,2025-04-06T00:30:00Z,503,120,ms,agent-1,ap-south-1',
  'svc-b,b-api,2025-04-06T00:00:00Z,200,0.2,s,agent-1,ap-south-1',
  'svc-b,b-api,2025-04-06T00:15:00Z,200,0.3,s,agent-1,ap-south-1',
  'svc-b,b-api,2025-04-06T00:30:00Z,200,0.4,s,agent-1,ap-south-1'];

describe('cleanCsv', () => {
  it('detects interval, range and coverage from the data', () => {
    const r = ok(BASE.join('\r\n'));
    expect(r.intervalMin).toBe(15);
    expect(r.rangeStart).toBe(Date.UTC(2025, 3, 6, 0, 0));
    expect(r.rangeEnd).toBe(Date.UTC(2025, 3, 6, 0, 30));
    expect(r.expectedChecks).toBe(6);
    expect(r.checks).toHaveLength(6);
    expect(r.gaps).toBe(0);
    expect(r.services).toEqual([{ id: 'svc-a', name: 'a-api' }, { id: 'svc-b', name: 'b-api' }]);
    expect(r.issues.unitConverted).toEqual({ s: 3 });
    expect(r.checks.filter(c => c.isFailed)).toHaveLength(1);
  });
  it('merges duplicate reports; a failure wins; agents are kept', () => {
    const r = ok([...BASE, 'svc-a,a-api,2025-04-06T00:15:00Z,502,130,ms,agent-2,ap-south-1'].join('\n'));
    const c = r.checks.find(x => x.serviceId === 'svc-a' && x.slot === Date.UTC(2025, 3, 6, 0, 15))!;
    expect(c.status).toBe(502);
    expect(c.isFailed).toBe(true);
    expect(c.agents).toEqual(['agent-1', 'agent-2']);
    expect(c.flags).toContain('merged');
    expect(r.issues.mergedRows).toBe(1);
  });
  it('drops exact duplicate lines and merges the same check written in another format', () => {
    const r = ok([...BASE, BASE[1]!, 'svc-a,a-api,2025-04-06T05:30:00+05:30,200,100,ms,agent-1,ap-south-1'].join('\n'));
    expect(r.issues.exactDuplicates).toBe(1);
    expect(r.issues.offset).toBe(1);
    expect(r.checks).toHaveLength(6);
  });
  it('uses a valid status from another agent instead of 999', () => {
    const r = ok([...BASE, 'svc-b,b-api,2025-04-06T00:30:00Z,999,0.4,s,agent-2,ap-south-1'].join('\n'));
    const c = r.checks.find(x => x.serviceId === 'svc-b' && x.slot === Date.UTC(2025, 3, 6, 0, 30))!;
    expect(c.status).toBe(200);
    expect(c.isValid).toBe(true);
    expect(c.flags).not.toContain('invalid_status');
  });
  it('snaps an off-grid timestamp to the nearest slot and flags it', () => {
    const r = ok([...BASE.slice(0, 2), 'svc-a,a-api,2025-04-06T00:16:10Z,200,110,ms,agent-1,ap-south-1', ...BASE.slice(3)].join('\n'));
    expect(r.issues.snapped).toBe(1);
    expect(r.checks.find(x => x.serviceId === 'svc-a' && x.flags.includes('snapped'))?.slot).toBe(Date.UTC(2025, 3, 6, 0, 15));
  });
  it('counts a missing slot as a gap, not a check', () => {
    const r = ok(BASE.filter((_, i) => i !== 2).join('\n'));
    expect(r.checks).toHaveLength(5);
    expect(r.gaps).toBe(1);
  });
  it('rejects unreadable rows but keeps the rest', () => {
    const r = ok([...BASE, 'svc-a,a-api,13/05/2025 16:00,200,12,ms,agent-1,ap-south-1'].join('\n'));
    expect(r.rejected).toEqual([{ line: 8, raw: 'svc-a,a-api,13/05/2025 16:00,200,12,ms,agent-1,ap-south-1', reason: 'Unrecognised timestamp "13/05/2025 16:00"' }]);
    expect(r.checks).toHaveLength(6);
  });
  it('counts 4xx as up', () => {
    const r = ok([...BASE.slice(0, 1), 'svc-a,a-api,2025-04-06T00:00:00Z,429,100,ms,agent-1,ap-south-1', ...BASE.slice(2)].join('\n'));
    expect(r.issues.status4xx).toBe(1);
    expect(r.checks.find(x => x.status === 429)?.isFailed).toBe(false);
  });
  it('strips a UTF-8 BOM', () => {
    expect(ok('\uFEFF' + BASE.join('\n')).checks).toHaveLength(6);
  });
  it('maps columns by name, case-insensitive, ignores extras', () => {
    const text = ['NOTES,Agent,Latency_Unit,Latency,Status_Code,Timestamp,Service_Name,Service_ID',
      'x,agent-1,ms,100,200,2025-04-06T00:00:00Z,a-api,svc-a',
      'y,agent-1,ms,110,200,2025-04-06T00:15:00Z,a-api,svc-a'].join('\n');
    const r = ok(text);
    expect(r.checks).toHaveLength(2);
    expect(r.checks[0]!.region).toBeNull();
  });
  it('EMPTY: header only', () => {
    expect(cleanCsv(H + '\n\n')).toMatchObject({ ok: false, code: 'EMPTY' });
  });
  it('MISSING_COLUMNS: lists what is missing and what was found', () => {
    expect(cleanCsv('service,time,code\nsvc-a,2025-04-06T00:00:00Z,200')).toMatchObject({
      ok: false, code: 'MISSING_COLUMNS',
      missing: ['service_id', 'service_name', 'timestamp', 'status_code', 'latency', 'latency_unit', 'agent'],
      found: ['service', 'time', 'code'],
    });
  });
  it('NO_READABLE_ROWS: every row rejected', () => {
    const r = cleanCsv([H, 'svc-a,a-api,yesterday,200,1,ms,agent-1,x'].join('\n'));
    expect(r).toMatchObject({ ok: false, code: 'NO_READABLE_ROWS' });
    expect(!r.ok && r.rejected).toHaveLength(1);
  });
  it('rejects a line over MAX_LINE_CHARS without parsing it', () => {
    const long = 'svc-a,a-api,2025-04-06T01:30:00Z,200,12,ms,agent-1,' + 'x'.repeat(MAX_LINE_CHARS);
    const r = ok([...BASE, long].join('\n'));
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]!.reason).toBe(`Line is longer than ${MAX_LINE_CHARS} characters`);
    expect(r.rejected[0]!.raw.length).toBeLessThanOrEqual(200);
  });
  it('TOO_MANY_ROWS: more data rows than the limit', () => {
    expect(cleanCsv(BASE.join('\n'), { maxRows: 3 })).toMatchObject({ ok: false, code: 'TOO_MANY_ROWS' });
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -w @sla/core -- test/clean.test.ts`
Expected: FAIL — `cleanCsv` is not exported.

- [ ] **Step 7: Implement `clean.ts`**

`packages/core/src/clean.ts`
```ts
import { DEFAULT_INTERVAL_MIN, MAX_LINE_CHARS, MAX_ROWS, REQUIRED_COLUMNS } from './constants';
import { splitCsvLine } from './csv';
import { parseRow, type ParsedRow } from './row';
import type { Check, CleanIssues, CleanResult, QualityFlag, RejectedRow } from './types';

type Slotted = ParsedRow & { snapped: boolean };

const emptyIssues = (): CleanIssues => ({
  exactDuplicates: 0, epoch: 0, offset: 0, offsets: {}, unitConverted: {}, unitCase: 0, trimmed: 0,
  latencyMissing: 0, latencyNegative: 0, invalidStatus: 0, status4xx: 0, snapped: 0, mergedRows: 0,
});

function countIssues(issues: CleanIssues, r: ParsedRow): void {
  if (r.tsKind === 'epoch') issues.epoch++;
  if (r.tsKind === 'iso_offset' && r.tsOffset) {
    issues.offset++;
    issues.offsets[r.tsOffset] = (issues.offsets[r.tsOffset] ?? 0) + 1;
  }
  if (r.unit && r.unit !== 'ms') issues.unitConverted[r.unit] = (issues.unitConverted[r.unit] ?? 0) + 1;
  if (r.unitCaseFixed) issues.unitCase++;
  if (r.trimmed) issues.trimmed++;
  if (r.latencyIssue === 'missing') issues.latencyMissing++;
  if (r.latencyIssue === 'negative') issues.latencyNegative++;
  if (!r.statusValid) issues.invalidStatus++;
  else if (r.status >= 400 && r.status <= 499) issues.status4xx++;
}

/** Most common gap between distinct timestamps of the same service. */
export function detectInterval(rows: { serviceId: string; ms: number }[]): { intervalMs: number; hits: number; totalGaps: number } {
  const perService = new Map<string, Set<number>>();
  for (const r of rows) {
    let set = perService.get(r.serviceId);
    if (!set) { set = new Set(); perService.set(r.serviceId, set); }
    set.add(r.ms);
  }
  const gapCount = new Map<number, number>();
  for (const set of perService.values()) {
    const sorted = [...set].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i]! - sorted[i - 1]!;
      gapCount.set(gap, (gapCount.get(gap) ?? 0) + 1);
    }
  }
  let intervalMs = DEFAULT_INTERVAL_MIN * 60_000;
  let hits = 0;
  let totalGaps = 0;
  for (const [gap, n] of gapCount) {
    totalGaps += n;
    if (n > hits) { hits = n; intervalMs = gap; }
  }
  return { intervalMs, hits, totalGaps };
}

/** One check per service + slot: a valid failure wins, a valid status beats an invalid one. */
function mergeGroup(group: Slotted[]): Check {
  const valid = group.filter(r => r.statusValid);
  const pick = valid.find(r => r.status >= 500 && r.status <= 599) ?? valid[0] ?? group[0]!;
  const latencyMs = pick.latencyMs ?? group.find(r => r.latencyMs !== null)?.latencyMs ?? null;
  const flags = new Set<QualityFlag>();
  for (const r of group) {
    if (r.tsKind === 'epoch') flags.add('epoch_ts');
    if (r.tsKind === 'iso_offset') flags.add('offset_ts');
    if (r.unit && r.unit !== 'ms') flags.add('unit_converted');
    if (r.latencyIssue === 'missing') flags.add('latency_missing');
    if (r.latencyIssue === 'negative') flags.add('latency_negative');
    if (!r.statusValid) flags.add('invalid_status');
    if (r.snapped) flags.add('snapped');
  }
  if (group.length > 1) flags.add('merged');
  if (valid.length > 0) flags.delete('invalid_status');
  if (latencyMs !== null) { flags.delete('latency_missing'); flags.delete('latency_negative'); }
  const isValid = valid.length > 0;
  return {
    serviceId: pick.serviceId, slot: pick.ms, status: pick.status, isValid,
    isFailed: isValid && pick.status >= 500 && pick.status <= 599,
    latencyMs, agents: [...new Set(group.map(r => r.agent))].sort(), region: pick.region, flags: [...flags].sort(),
  };
}

export function cleanCsv(text: string, opts: { maxRows?: number } = {}): CleanResult {
  const maxRows = opts.maxRows ?? MAX_ROWS;
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim() !== '');
  const header = lines[0] ? splitCsvLine(lines[0].slice(0, MAX_LINE_CHARS)).map(h => h.trim().toLowerCase()) : [];
  if (lines.length < 2) return { ok: false, code: 'EMPTY', message: 'The file has no data rows.', found: header };
  if (lines.length - 1 > maxRows) {
    return { ok: false, code: 'TOO_MANY_ROWS', message: `The file has ${lines.length - 1} data rows; the limit is ${maxRows}.`, found: header };
  }
  const missing = REQUIRED_COLUMNS.filter(c => !header.includes(c));
  if (missing.length) return { ok: false, code: 'MISSING_COLUMNS', message: 'Required columns are missing.', missing: [...missing], found: header };
  const col: Record<string, number> = {};
  header.forEach((h, i) => { if (col[h] === undefined) col[h] = i; });

  const issues = emptyIssues();
  const rejected: RejectedRow[] = [];
  const names = new Map<string, string>();
  const seen = new Set<string>();
  const parsed: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.length > MAX_LINE_CHARS) {
      rejected.push({ line: i + 1, raw: line.slice(0, 200), reason: `Line is longer than ${MAX_LINE_CHARS} characters` });
      continue;
    }
    if (seen.has(line)) { issues.exactDuplicates++; continue; }
    seen.add(line);
    const res = parseRow(splitCsvLine(line), col, header.length);
    if (!res.ok) { rejected.push({ line: i + 1, raw: line, reason: res.reason }); continue; }
    countIssues(issues, res.row);
    if (!names.has(res.row.serviceId)) names.set(res.row.serviceId, res.row.serviceName);
    parsed.push(res.row);
  }
  if (!parsed.length) return { ok: false, code: 'NO_READABLE_ROWS', message: 'No row in the file could be read.', found: header, rejected };

  const { intervalMs, hits, totalGaps } = detectInterval(parsed);
  const groups = new Map<string, Slotted[]>();
  for (const r of parsed) {
    const slot = Math.round(r.ms / intervalMs) * intervalMs;
    const snapped = slot !== r.ms;
    if (snapped) issues.snapped++;
    const key = `${r.serviceId}|${slot}`;
    const item: Slotted = { ...r, ms: slot, snapped };
    const group = groups.get(key);
    if (group) group.push(item); else groups.set(key, [item]);
  }
  const checks: Check[] = [];
  for (const group of groups.values()) {
    if (group.length > 1) issues.mergedRows += group.length - 1;
    checks.push(mergeGroup(group));
  }
  checks.sort((a, b) => a.slot - b.slot || a.serviceId.localeCompare(b.serviceId));

  let rangeStart = Infinity;
  let rangeEnd = -Infinity;
  for (const c of checks) { if (c.slot < rangeStart) rangeStart = c.slot; if (c.slot > rangeEnd) rangeEnd = c.slot; }
  const services = [...names.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id));
  const slots = Math.round((rangeEnd - rangeStart) / intervalMs) + 1;
  const expectedChecks = services.length * slots;
  const agents = new Set<string>();
  const regions = new Set<string>();
  for (const c of checks) { c.agents.forEach(a => agents.add(a)); if (c.region) regions.add(c.region); }

  return {
    ok: true, services, checks, rejected,
    intervalMin: intervalMs / 60_000, intervalHits: hits, totalGaps,
    rangeStart, rangeEnd, days: (rangeEnd - rangeStart + intervalMs) / 86_400_000,
    expectedChecks, gaps: expectedChecks - checks.length, rowsTotal: lines.length - 1,
    issues, agents: [...agents].sort(), regions: [...regions].sort(),
  };
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './clean';
```

- [ ] **Step 8: Run to verify the pipeline tests pass**

Run: `npm test -w @sla/core -- test/clean.test.ts test/row.test.ts` → PASS (22 tests)
Run: `npm run typecheck -w @sla/core` → no errors

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/row.ts packages/core/src/clean.ts packages/core/src/index.ts packages/core/test/row.test.ts packages/core/test/clean.test.ts
git commit -m "core: cleaning pipeline with interval detection, snapping and merging"
```

---

### Task 5: Fixture tests on the 5 sample files

**Files:**
- Create: `packages/core/test/helpers.ts`, `packages/core/test/samples.test.ts`

**Interfaces:**
- Consumes: `cleanCsv`, `CleanOk`.
- Produces (test helpers used by Tasks 6–9): `readSample(name: string): string`, `readStress(name: string): string`, `hasStress(name: string): boolean`, `cleanSample(key: SampleKey): CleanOk`, `type SampleKey = '9d' | '12d' | '14d' | '21d' | '30d'`, `SAMPLE_FILES: Record<SampleKey, string>`.

- [ ] **Step 1: Write the helpers**

`packages/core/test/helpers.ts`
```ts
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanCsv, type CleanOk } from '../src/index';

const DATA = new URL('../../../data/', import.meta.url);
const path = (rel: string) => fileURLToPath(new URL(rel, DATA));

export const SAMPLE_FILES = {
  '9d': 'monitoring_checks_9d_seed101.csv',
  '12d': 'monitoring_checks_12d_seed505.csv',
  '14d': 'monitoring_checks_14d_seed202.csv',
  '21d': 'monitoring_checks_21d_seed303.csv',
  '30d': 'monitoring_checks_30d_seed404.csv',
} as const;
export type SampleKey = keyof typeof SAMPLE_FILES;

export const readSample = (name: string) => readFileSync(path(`samples/${name}`), 'utf8');
export const readStress = (name: string) => readFileSync(path(`stress/${name}`), 'utf8');
export const hasStress = (name: string) => existsSync(path(`stress/${name}`));

const cache = new Map<SampleKey, CleanOk>();
export function cleanSample(key: SampleKey): CleanOk {
  const hit = cache.get(key);
  if (hit) return hit;
  const r = cleanCsv(readSample(SAMPLE_FILES[key]));
  if (!r.ok) throw new Error(`${key}: ${r.message}`);
  cache.set(key, r);
  return r;
}
```

- [ ] **Step 2: Write the fixture tests (values measured on the real files — see README "Data findings")**

`packages/core/test/samples.test.ts`
```ts
import { describe, expect, it } from 'vitest';
import { cleanSample, type SampleKey } from './helpers';

const EXPECTED: Record<SampleKey, {
  start: string; days: number; rows: number; checks: number; exactDup: number; epoch: number; offset: number;
  seconds: number; latMissing: number; mergedRows: number; failed: number; invalid: number; nullLatency: number;
}> = {
  '9d':  { start: '2025-05-08T00:00:00.000Z', days: 9,  rows: 4672,  checks: 4320,  exactDup: 6,  epoch: 70,  offset: 32,  seconds: 924,  latMissing: 56,  mergedRows: 346,  failed: 41,  invalid: 1, nullLatency: 48 },
  '12d': { start: '2025-04-10T00:00:00.000Z', days: 12, rows: 6230,  checks: 5760,  exactDup: 8,  epoch: 93,  offset: 43,  seconds: 1227, latMissing: 74,  mergedRows: 462,  failed: 77,  invalid: 1, nullLatency: 66 },
  '14d': { start: '2025-05-19T00:00:00.000Z', days: 14, rows: 7269,  checks: 6720,  exactDup: 10, epoch: 109, offset: 50,  seconds: 1433, latMissing: 87,  mergedRows: 539,  failed: 105, invalid: 0, nullLatency: 72 },
  '21d': { start: '2025-04-03T00:00:00.000Z', days: 21, rows: 10904, checks: 10080, exactDup: 18, epoch: 163, offset: 76,  seconds: 2147, latMissing: 130, mergedRows: 806,  failed: 124, invalid: 1, nullLatency: 108 },
  '30d': { start: '2025-04-06T00:00:00.000Z', days: 30, rows: 15577, checks: 14400, exactDup: 24, epoch: 233, offset: 109, seconds: 3090, latMissing: 186, mergedRows: 1153, failed: 182, invalid: 1, nullLatency: 167 },
};

describe.each(Object.entries(EXPECTED) as [SampleKey, (typeof EXPECTED)[SampleKey]][])('sample %s', (key, e) => {
  const r = cleanSample(key);
  it('detects range, interval and services from the data', () => {
    expect(new Date(r.rangeStart).toISOString()).toBe(e.start);
    expect(r.days).toBe(e.days);
    expect(r.intervalMin).toBe(15);
    expect(r.intervalHits).toBe(r.totalGaps);
    expect(r.services).toHaveLength(5);
    expect(r.regions).toEqual(['ap-south-1']);
    expect(r.agents).toEqual(['agent-1', 'agent-2']);
  });
  it('stores exactly services × days × 96 checks with nothing rejected', () => {
    expect(r.rowsTotal).toBe(e.rows);
    expect(r.checks).toHaveLength(e.checks);
    expect(r.expectedChecks).toBe(5 * e.days * 96);
    expect(r.gaps).toBe(0);
    expect(r.rejected).toEqual([]);
  });
  it('finds every known data issue', () => {
    expect(r.issues.exactDuplicates).toBe(e.exactDup);
    expect(r.issues.epoch).toBe(e.epoch);
    expect(r.issues.offset).toBe(e.offset);
    expect(r.issues.offsets).toEqual({ '+05:30': e.offset });
    expect(r.issues.unitConverted).toEqual({ s: e.seconds });
    expect(r.issues.latencyMissing).toBe(e.latMissing);
    expect(r.issues.latencyNegative).toBe(1);
    expect(r.issues.invalidStatus).toBe(1);
    expect(r.issues.mergedRows).toBe(e.mergedRows);
    expect(r.issues.status4xx).toBe(0);
    expect(r.issues.snapped).toBe(0);
  });
  it('classifies checks', () => {
    expect(r.checks.filter(c => c.isFailed)).toHaveLength(e.failed);
    expect(r.checks.filter(c => !c.isValid)).toHaveLength(e.invalid);
    expect(r.checks.filter(c => c.latencyMs === null)).toHaveLength(e.nullLatency);
  });
});
```

- [ ] **Step 3: Run the fixture tests**

Run: `npm test -w @sla/core -- test/samples.test.ts`
Expected: PASS (20 tests). If a count differs, the cleaner changed behaviour — fix the code, not the expected value (values are from the data analysis in README).

- [ ] **Step 4: Commit**

```bash
git add packages/core/test/helpers.ts packages/core/test/samples.test.ts
git commit -m "core: fixture tests — exact counts on all 5 sample files"
```

---

### Task 6: Per-service SLA stats

**Files:**
- Create: `packages/core/src/sla.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/sla.test.ts`

**Interfaces:**
- Consumes: `CleanOk`, `Check`, `ServiceStat`, `SLA_TARGET`; test helper `cleanSample`.
- Produces: `percentile(sorted: readonly number[], q: number): number | null` (nearest rank, index `floor(q × (n − 1))`); `serviceStats(r: CleanOk, target?: number): ServiceStat[]` sorted worst availability first (null last); `groupByService(checks: Check[]): Map<string, Check[]>`.

- [ ] **Step 1: Write the failing test**

`packages/core/test/sla.test.ts`
```ts
import { describe, expect, it } from 'vitest';
import { percentile, serviceStats } from '../src/index';
import { cleanSample } from './helpers';

describe('percentile', () => {
  it('uses nearest rank on a sorted array', () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(20);
    expect(percentile([10, 20, 30, 40], 0.95)).toBe(30);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe('serviceStats — 30-day sample', () => {
  const stats = serviceStats(cleanSample('30d'));
  const by = Object.fromEntries(stats.map(s => [s.serviceId, s]));

  it('sorts worst availability first', () => {
    expect(stats.map(s => s.serviceId)).toEqual(['svc-reports', 'svc-payments', 'svc-auth', 'svc-search', 'svc-notify']);
  });
  it('computes availability, downtime and allowance', () => {
    const r = by['svc-reports']!;
    expect(r.valid).toBe(2880);
    expect(r.failed).toBe(82);
    expect(r.availability!).toBeCloseTo(97.153, 3);
    expect(r.met).toBe(false);
    expect(r.downtimeMin).toBe(1230);
    expect(r.allowedDowntimeMin).toBeCloseTo(43.2, 6);
    expect(r.timesAllowance).toBeCloseTo(28.47, 2);
  });
  it('leaves the invalid 999 check out of availability but counts it as present', () => {
    const a = by['svc-auth']!;
    expect(a.valid).toBe(2879);
    expect(a.present).toBe(2880);
    expect(a.failed).toBe(29);
    expect(a.availability!).toBeCloseTo(98.993, 3);
    expect(a.coverage).toBe(100);
  });
  it('computes latency percentiles from successful checks', () => {
    expect([by['svc-reports']!.p50Ms, by['svc-reports']!.p95Ms]).toEqual([654, 845]);
    expect([by['svc-notify']!.p50Ms, by['svc-notify']!.p95Ms]).toEqual([113, 148]);
  });
  it('every service misses 99.9% in this file', () => {
    expect(stats.every(s => s.met === false)).toBe(true);
  });
});

describe('serviceStats — coverage with gaps', () => {
  it('reports coverage below 100% when checks are missing', () => {
    const r = cleanSample('9d');
    const trimmed = { ...r, checks: r.checks.filter((c, i) => !(c.serviceId === 'svc-auth' && i % 100 === 0)) };
    const auth = serviceStats(trimmed).find(s => s.serviceId === 'svc-auth')!;
    expect(auth.present).toBeLessThan(auth.expected);
    expect(auth.coverage).toBeLessThan(100);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @sla/core -- test/sla.test.ts`
Expected: FAIL — `percentile` is not exported.

- [ ] **Step 3: Implement**

`packages/core/src/sla.ts`
```ts
import { SLA_TARGET } from './constants';
import type { Check, CleanOk, ServiceStat } from './types';

/** Nearest-rank percentile of an ascending array: element at floor(q × (n − 1)). */
export function percentile(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.floor(q * (sorted.length - 1))] ?? null;
}

export function groupByService(checks: Check[]): Map<string, Check[]> {
  const by = new Map<string, Check[]>();
  for (const c of checks) {
    const list = by.get(c.serviceId);
    if (list) list.push(c); else by.set(c.serviceId, [c]);
  }
  return by;
}

export function serviceStats(r: CleanOk, target: number = SLA_TARGET): ServiceStat[] {
  const intervalMs = r.intervalMin * 60_000;
  const expected = Math.round((r.rangeEnd - r.rangeStart) / intervalMs) + 1;
  const allowedDowntimeMin = expected * r.intervalMin * (100 - target) / 100;
  const by = groupByService(r.checks);
  const stats = r.services.map(({ id }): ServiceStat => {
    const cs = by.get(id) ?? [];
    let valid = 0;
    let failed = 0;
    const latencies: number[] = [];
    for (const c of cs) {
      if (!c.isValid) continue;
      valid++;
      if (c.isFailed) failed++;
      else if (c.latencyMs !== null) latencies.push(c.latencyMs);
    }
    latencies.sort((a, b) => a - b);
    const availability = valid ? (100 * (valid - failed)) / valid : null;
    const downtimeMin = failed * r.intervalMin;
    return {
      serviceId: id, valid, failed, present: cs.length, expected,
      availability, met: availability === null ? null : availability >= target,
      downtimeMin, allowedDowntimeMin, timesAllowance: downtimeMin / allowedDowntimeMin,
      p50Ms: percentile(latencies, 0.5), p95Ms: percentile(latencies, 0.95),
      coverage: (100 * cs.length) / expected,
    };
  });
  return stats.sort((a, b) => (a.availability ?? Infinity) - (b.availability ?? Infinity) || a.serviceId.localeCompare(b.serviceId));
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './sla';
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w @sla/core -- test/sla.test.ts` → PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sla.ts packages/core/src/index.ts packages/core/test/sla.test.ts
git commit -m "core: per-service SLA stats, downtime allowance and latency percentiles"
```

---

### Task 7: Incident detection (checked against the answer key)

**Files:**
- Create: `packages/core/src/incidents.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/incidents.test.ts`

**Interfaces:**
- Consumes: `CleanOk`, `Incident`, `percentile`, `groupByService`, `INCIDENT_MAX_GAP_MIN`, `INCIDENT_MIN_RUN`; helpers `cleanSample`, `readSample`, `SAMPLE_FILES`.
- Produces: `detectIncidents(r: CleanOk, maxGapMin?: number, minRun?: number): Incident[]` sorted by start, then serviceId.

- [ ] **Step 1: Write the failing test**

`packages/core/test/incidents.test.ts`
```ts
import { describe, expect, it } from 'vitest';
import { detectIncidents } from '../src/index';
import { cleanSample, readSample, SAMPLE_FILES, type SampleKey } from './helpers';

const iso = (ms: number) => new Date(ms).toISOString();

describe('detectIncidents — 30-day sample', () => {
  const inc = detectIncidents(cleanSample('30d'));
  it('finds the two outages with exact windows', () => {
    expect(inc.map(i => [i.serviceId, iso(i.start), iso(i.end), i.failedChecks])).toEqual([
      ['svc-reports', '2025-04-09T11:45:00.000Z', '2025-04-09T14:00:00.000Z', 7],
      ['svc-auth', '2025-04-22T04:00:00.000Z', '2025-04-22T10:15:00.000Z', 18],
    ]);
  });
  it('reports latency during vs normal (outages run 3–4× slower)', () => {
    for (const i of inc) expect(i.medianLatencyMs! / i.normalLatencyMs!).toBeGreaterThan(2.5);
  });
});

describe('detectIncidents — counts per sample', () => {
  it.each([['9d', 2], ['12d', 2], ['14d', 3], ['21d', 3], ['30d', 2]] as [SampleKey, number][])('%s → %i incidents', (key, n) => {
    expect(detectIncidents(cleanSample(key))).toHaveLength(n);
  });
});

describe('answer key (data/samples/dataset_incident_log.json)', () => {
  const log = JSON.parse(readSample('dataset_incident_log.json')) as Record<string, { start: string; incidents: Record<string, string> }>;
  const FIFTEEN = 15 * 60_000;
  for (const key of Object.keys(SAMPLE_FILES) as SampleKey[]) {
    const entry = log[SAMPLE_FILES[key]]!;
    for (const [label, window] of Object.entries(entry.incidents)) {
      it(`${key}: ${label} (${window}) is detected`, () => {
        const [, serviceId, day] = /^(\S+) day (\d+)$/.exec(label)!;
        const [, from, to] = /check-points (\d+)-(\d+)/.exec(window)!;
        const base = Date.parse(`${entry.start}T00:00:00Z`) + Number(day) * 96 * FIFTEEN;
        const start = base + Number(from) * FIFTEEN;
        const end = base + (Number(to) + 1) * FIFTEEN;
        const found = detectIncidents(cleanSample(key)).filter(i => i.serviceId === serviceId && i.start < end && i.end > start);
        expect(found).toHaveLength(1);
      });
    }
  }
});

describe('rules', () => {
  it('a single isolated failure is not an incident', () => {
    const r = cleanSample('30d');
    const notify = detectIncidents(r).filter(i => i.serviceId === 'svc-notify');
    expect(notify).toEqual([]); // 8 scattered failures, none in a row
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @sla/core -- test/incidents.test.ts`
Expected: FAIL — `detectIncidents` is not exported.

- [ ] **Step 3: Implement**

`packages/core/src/incidents.ts`
```ts
import { INCIDENT_MAX_GAP_MIN, INCIDENT_MIN_RUN } from './constants';
import { groupByService, percentile } from './sla';
import type { CleanOk, Incident } from './types';

/** Longest run of consecutive slots in an ascending list. */
function longestRun(slots: number[], intervalMs: number): number {
  let best = slots.length ? 1 : 0;
  let run = 1;
  for (let i = 1; i < slots.length; i++) {
    run = slots[i]! - slots[i - 1]! === intervalMs ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/**
 * Failures at most `maxGapMin` apart are grouped; a group is an incident when it has
 * `minRun` or more failed checks in a row. For on-call only — never changes SLA numbers.
 */
export function detectIncidents(r: CleanOk, maxGapMin: number = INCIDENT_MAX_GAP_MIN, minRun: number = INCIDENT_MIN_RUN): Incident[] {
  const intervalMs = r.intervalMin * 60_000;
  const maxGapMs = maxGapMin * 60_000;
  const out: Incident[] = [];
  for (const [serviceId, checks] of groupByService(r.checks)) {
    const failedSlots = checks.filter(c => c.isFailed).map(c => c.slot).sort((a, b) => a - b);
    const found: Incident[] = [];
    let group: number[] = [];
    const flush = () => {
      if (group.length && longestRun(group, intervalMs) >= minRun) {
        const start = group[0]!;
        const last = group[group.length - 1]!;
        const inside = checks.filter(c => c.slot >= start && c.slot <= last && c.latencyMs !== null).map(c => c.latencyMs!).sort((a, b) => a - b);
        found.push({ serviceId, start, end: last + intervalMs, failedChecks: group.length, medianLatencyMs: percentile(inside, 0.5), normalLatencyMs: null });
      }
      group = [];
    };
    for (const slot of failedSlots) {
      const prev = group[group.length - 1];
      if (prev !== undefined && slot - prev > maxGapMs) flush();
      group.push(slot);
    }
    flush();
    const normal = checks
      .filter(c => !c.isFailed && c.latencyMs !== null && !found.some(i => c.slot >= i.start && c.slot < i.end))
      .map(c => c.latencyMs!)
      .sort((a, b) => a - b);
    const normalLatencyMs = percentile(normal, 0.5);
    for (const i of found) out.push({ ...i, normalLatencyMs });
  }
  return out.sort((a, b) => a.start - b.start || a.serviceId.localeCompare(b.serviceId));
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './incidents';
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w @sla/core -- test/incidents.test.ts` → PASS (16 tests: 2 + 5 + 8 answer-key windows + 1 rule)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/incidents.ts packages/core/src/index.ts packages/core/test/incidents.test.ts
git commit -m "core: incident detection — matches all 8 windows in the answer key"
```

---

### Task 8: Hourly failure counts (feeds the hex map and timeline)

**Files:**
- Create: `packages/core/src/hourly.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/hourly.test.ts`

**Interfaces:**
- Consumes: `CleanOk`, `HourlyFailure`; helper `cleanSample`.
- Produces: `hourlyFailures(r: CleanOk): HourlyFailure[]` sorted by serviceId, then hour; one row per service per UTC hour that has at least one check.

- [ ] **Step 1: Write the failing test**

`packages/core/test/hourly.test.ts`
```ts
import { describe, expect, it } from 'vitest';
import { hourlyFailures } from '../src/index';
import { cleanSample } from './helpers';

describe('hourlyFailures — 30-day sample', () => {
  const rows = hourlyFailures(cleanSample('30d'));
  it('has one row per service per hour', () => {
    expect(rows).toHaveLength(5 * 30 * 24);
  });
  it('adds up to the stored and failed checks', () => {
    let checks = 0; let failed = 0;
    for (const r of rows) { checks += r.checks; failed += r.failed; }
    expect(checks).toBe(14400);
    expect(failed).toBe(182);
  });
  it('rows are aligned to the hour and each hour holds at most 4 checks', () => {
    for (const r of rows) {
      expect(r.hour % 3_600_000).toBe(0);
      expect(r.checks).toBeLessThanOrEqual(4);
    }
  });
  it('shows the auth outage as a streak of failing hours on 22 Apr', () => {
    const auth = rows.filter(r => r.serviceId === 'svc-auth' && r.failed > 0 && new Date(r.hour).toISOString().startsWith('2025-04-22'));
    expect(auth.reduce((s, r) => s + r.failed, 0)).toBe(18);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @sla/core -- test/hourly.test.ts`
Expected: FAIL — `hourlyFailures` is not exported.

- [ ] **Step 3: Implement**

`packages/core/src/hourly.ts`
```ts
import type { CleanOk, HourlyFailure } from './types';

const HOUR = 3_600_000;

export function hourlyFailures(r: CleanOk): HourlyFailure[] {
  const byKey = new Map<string, HourlyFailure>();
  for (const c of r.checks) {
    const hour = Math.floor(c.slot / HOUR) * HOUR;
    const key = `${c.serviceId}|${hour}`;
    let row = byKey.get(key);
    if (!row) { row = { serviceId: c.serviceId, hour, checks: 0, failed: 0 }; byKey.set(key, row); }
    row.checks++;
    if (c.isFailed) row.failed++;
  }
  return [...byKey.values()].sort((a, b) => a.serviceId.localeCompare(b.serviceId) || a.hour - b.hour);
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './hourly';
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w @sla/core -- test/hourly.test.ts` → PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/hourly.ts packages/core/src/index.ts packages/core/test/hourly.test.ts
git commit -m "core: hourly failure counts for the hex map and timeline"
```

---

### Task 9: Batch helper for Lambda writes (ADR-011)

**Files:**
- Create: `packages/core/src/batch.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/batch.test.ts`

**Interfaces:**
- Consumes: `BATCH_SIZE`; helper `cleanSample`.
- Produces: `batches<T>(items: readonly T[], size?: number): Generator<T[]>` — yields consecutive slices of at most `size` items (default `BATCH_SIZE`), in order. The API plan writes each yielded batch with one `INSERT … SELECT FROM unnest(…)`, all inside one transaction.

- [ ] **Step 1: Write the failing test**

`packages/core/test/batch.test.ts`
```ts
import { describe, expect, it } from 'vitest';
import { BATCH_SIZE, batches } from '../src/index';
import { cleanSample } from './helpers';

describe('batches', () => {
  it('splits into fixed-size batches, last one shorter', () => {
    const items = Array.from({ length: 12_345 }, (_, i) => i);
    expect([...batches(items, 5_000)].map(b => b.length)).toEqual([5_000, 5_000, 2_345]);
  });
  it('keeps order and loses nothing', () => {
    const items = Array.from({ length: 11 }, (_, i) => i);
    expect([...batches(items, 4)].flat()).toEqual(items);
  });
  it('yields nothing for an empty list', () => {
    expect([...batches([], 10)]).toEqual([]);
  });
  it('defaults to BATCH_SIZE', () => {
    const sizes = [...batches(cleanSample('30d').checks)].map(b => b.length);
    expect(sizes).toEqual([BATCH_SIZE, BATCH_SIZE, 14_400 - 2 * BATCH_SIZE]);
  });
  it('rejects a size below 1', () => {
    expect(() => [...batches([1, 2], 0)]).toThrow('Batch size must be a positive integer');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @sla/core -- test/batch.test.ts`
Expected: FAIL — `batches` is not exported.

- [ ] **Step 3: Implement**

`packages/core/src/batch.ts`
```ts
import { BATCH_SIZE } from './constants';

/** Consecutive slices of at most `size` items — used to write large uploads in bounded chunks. */
export function* batches<T>(items: readonly T[], size: number = BATCH_SIZE): Generator<T[]> {
  if (!Number.isInteger(size) || size < 1) throw new Error('Batch size must be a positive integer');
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './batch';
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w @sla/core -- test/batch.test.ts` → PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/batch.ts packages/core/src/index.ts packages/core/test/batch.test.ts
git commit -m "core: batches() helper for batched Lambda writes"
```

---

### Task 10: Stress tests and docs sync

**Files:**
- Create: `packages/core/test/stress.test.ts`
- Modify: `.claude/architecture/ARCHITECTURE.md` (folder tree under `packages/core/src`)
- Modify: `.claude/rules/RULES.md` (constants line)

**Interfaces:**
- Consumes: `cleanCsv`, `serviceStats`, `detectIncidents`, `hourlyFailures`, `batches`; helpers `readStress`, `hasStress`.

- [ ] **Step 1: Generate the stress files (not committed)**

Run: `node .claude/commands/generate-stress.js --preset small,chaos,large`
Expected: three CSVs + `stress_incident_log.json` in `data/stress/`.

- [ ] **Step 2: Write the stress tests (skip cleanly when a file is not generated)**

`packages/core/test/stress.test.ts`
```ts
import { describe, expect, it } from 'vitest';
import { batches, cleanCsv, detectIncidents, hourlyFailures, serviceStats, type CleanOk } from '../src/index';
import { hasStress, readStress } from './helpers';

const SMALL = 'stress_small_10svc_14d_seed11.csv';
const CHAOS = 'stress_chaos_30svc_30d_seed55.csv';
const LARGE = 'stress_large_50svc_90d_seed33.csv';
const ok = (name: string): CleanOk => {
  const r = cleanCsv(readStress(name));
  if (!r.ok) throw new Error(r.message);
  return r;
};

describe.skipIf(!hasStress(SMALL))('stress small — 10 services × 14 days', () => {
  it('stores every check and reports the gaps', () => {
    const r = ok(SMALL);
    expect(r.services).toHaveLength(10);
    expect(r.checks).toHaveLength(13403);
    expect(r.gaps).toBe(37);
    expect(r.rejected).toEqual([]);
  });
});

describe.skipIf(!hasStress(CHAOS))('stress chaos — 30 services, messy fields', () => {
  const r = hasStress(CHAOS) ? ok(CHAOS) : (null as unknown as CleanOk);
  it('reads everything: padded fields, upper-case units, 4xx', () => {
    expect(r.rejected).toEqual([]);
    expect(r.checks).toHaveLength(86128);
    expect(r.issues.trimmed).toBe(495);
    expect(r.issues.unitCase).toBe(914);
    expect(r.issues.status4xx).toBe(276);
  });
  it('keeps one name per service after trimming', () => {
    expect(r.services).toHaveLength(30);
    expect(r.services.every(s => s.name === s.name.trim())).toBe(true);
  });
  it('detects 3 agents and 4 regions', () => {
    expect(r.agents).toHaveLength(3);
    expect(r.regions).toEqual(['ap-south-1', 'ap-southeast-2', 'eu-west-1', 'us-east-1']);
  });
  it('4xx never counts as a failure', () => {
    expect(r.checks.filter(c => c.status >= 400 && c.status < 500 && c.isFailed)).toEqual([]);
  });
});

describe.skipIf(!hasStress(LARGE))('stress large — 50 services × 90 days', () => {
  it('cleans ~464k rows without crashing, in reasonable time', () => {
    const t = performance.now();
    const r = ok(LARGE);
    const stats = serviceStats(r);
    const inc = detectIncidents(r);
    const hours = hourlyFailures(r);
    expect(r.rowsTotal).toBe(463637);
    expect(r.checks).toHaveLength(430738);
    expect(r.gaps).toBe(1262);
    expect(stats).toHaveLength(50);
    expect(inc.length).toBeGreaterThan(0);
    expect(hours.length).toBeLessThanOrEqual(50 * 90 * 24);
    expect([...batches(r.checks)].length).toBe(Math.ceil(430738 / 5_000)); // 87 writes of ≤ 5,000 rows
    expect(performance.now() - t).toBeLessThan(30_000);
  }, 60_000);
});
```

- [ ] **Step 3: Run the stress tests**

Run: `npm test -w @sla/core -- test/stress.test.ts`
Expected: PASS (6 tests). Without the generated files: 6 skipped, 0 failed.

- [ ] **Step 4: Run the whole suite and typecheck**

Run: `npm test -w @sla/core` → all PASS
Run: `npm run typecheck -w @sla/core` → no errors

- [ ] **Step 5: Sync the docs**

In `.claude/architecture/ARCHITECTURE.md`, replace the four `packages/core` source lines:
```
│     ├─ src/clean.ts           cleanCsv(): parse · validate · normalise · merge
│     ├─ src/sla.ts             availability, downtime, allowance, percentiles, coverage
│     ├─ src/incidents.ts       incident grouping
│     ├─ src/types.ts           Check, Upload, Report … (shared with web)
```
with:
```
│     ├─ src/constants.ts       every tunable number (SLA target, incident gap, units)
│     ├─ src/types.ts           Check, CleanResult, ServiceStat, Incident, HourlyFailure
│     ├─ src/csv.ts · timestamp.ts · row.ts   line splitting, UTC parsing, row validation
│     ├─ src/clean.ts           cleanCsv(): validate · detect interval · snap · merge
│     ├─ src/sla.ts             availability, downtime, allowance, p50/p95, coverage
│     ├─ src/incidents.ts       incident grouping
│     ├─ src/hourly.ts          hourly failure counts (hex map, timeline)
```

In `.claude/rules/RULES.md`, replace
`- No magic numbers: \`TARGET = 99.9\`, \`SVC_PAGE = 5\`, \`INCIDENT_GAP_SLOTS = 4\` live in one constants file.`
with
`- No magic numbers: \`SLA_TARGET = 99.9\`, \`INCIDENT_MAX_GAP_MIN = 60\`, \`INCIDENT_MIN_RUN = 2\` live in \`packages/core/src/constants.ts\`; UI constants (e.g. \`SVC_PAGE = 5\`) in one web constants file.`

- [ ] **Step 6: Commit**

```bash
git add packages/core/test/stress.test.ts .claude/architecture/ARCHITECTURE.md .claude/rules/RULES.md
git commit -m "core: stress tests (small, chaos, large) and docs sync"
```

---

## Done when

- [ ] `npm test -w @sla/core` passes: constants, csv, timestamp, row, clean, 5 sample fixtures, sla, incidents (incl. all 8 answer-key windows), hourly, batch, stress.
- [ ] `npm run typecheck -w @sla/core` passes.
- [ ] `packages/core/src` has no import of `fs`, `path`, network, React or AWS.
- [ ] 10 commits on `main`, one per task.

## What the next plans take from this one

- **Plan 2 — API (Lambda + Neon + SAM):** `cleanCsv` → `serviceStats` / `detectIncidents` / `hourlyFailures` → write each table with `batches(rows, BATCH_SIZE)` (one `unnest` insert per batch) inside one transaction; paged, cursor-based read endpoints.
- **Plan 3 — Web (React + Vite):** every server read through **TanStack Query** hooks in `apps/web/src/api` (`useQuery` for stats/report, `useInfiniteQuery` for the service list, logs and uploads, `prefetchQuery` for the next log page, request cancellation on filter change); components render from query state (loading · error · data), matching DESIGN.md.
