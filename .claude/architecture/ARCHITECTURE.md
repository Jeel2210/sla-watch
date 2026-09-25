# Architecture — SLA Watch

> **How it works.** Scope lives in [REQUIREMENTS.md](../product-requirement/REQUIREMENTS.md),
> visuals in [DESIGN.md](../design/DESIGN.md), coding rules in [RULES.md](../rules/RULES.md).

---

## Stack

| Layer | Choice | Free tier |
|---|---|---|
| Frontend | **React 18 + Vite + TypeScript**, TanStack Query (fetch/cache/pagination), plain CSS with tokens | Vercel Hobby |
| Cloud function | **AWS Lambda, Node.js 20, TypeScript**, exposed with a **Lambda Function URL** | 1M requests / 400k GB-s per month |
| Database | **Neon Postgres** (serverless) via `@neondatabase/serverless` / `pg` | 0.5 GB storage |
| Infra as code | **AWS SAM** (`template.yaml`) — one-command deploy | free |
| Tests | **Vitest** (unit + fixture tests on the real CSVs) | — |
| Shared logic | `packages/core` — cleaner, SLA rules, incident detection, types; used by the API and the tests | — |

---

## System diagram

```
 Browser (Vercel: React SPA)
   │ 1. user picks CSV
   │ 2. gzip in the browser (CompressionStream) → ~10× smaller
   ▼
 POST /uploads ──────────────▶ AWS Lambda (Function URL, Node 20)
                                 │ gunzip → packages/core.cleanCsv()  (parse · validate · normalise · merge)
                                 │ incidents + summaries computed
                                 │ ONE transaction:
                                 ▼
                               Neon Postgres
                                 uploads · checks · rejected_rows
                                 service_stats · hourly_failures · incidents
                                 ▲
 GET /uploads/:id/…  ◀───────────┘  small, paged, pre-aggregated reads
   ▲
 Dashboard (TanStack Query cache, infinite scroll, skeletons)
```

**Why gzip in the browser:** Lambda accepts at most **6 MB** per request. CSVs compress about 10×, so a
50 MB file (≈ 460k rows, the `stress_large` size) fits in one request — no S3 bucket, no multi-part upload.

**Why a Function URL (not API Gateway):** API Gateway cuts requests at 29 s; a Function URL uses the
function's own timeout (set to 120 s), which covers the largest file (cleaning ≈ 4 s + inserts).

---

## Data flow — one upload

| Step | Where | What happens |
|---|---|---|
| 1 | Browser | Validate extension + size (≤ 50 MB raw), gzip, `POST /uploads` with file name |
| 2 | Lambda | Reject > 6 MB body (**413**); stream-gunzip with a **50 MB decompressed cap** (gzip-bomb guard → **413**); reject non-UTF-8 (**400**); SHA-256 → if already uploaded return the existing upload (**200**, `duplicate: true`) |
| 3 | `core.cleanCsv` | Header check (**422** with missing columns); limits: ≤ 1,000,000 rows, ≤ 4 KB per line, capped field lengths → per row: trim, parse timestamp (ISO any offset / epoch s / ms), status, latency + unit (case-insensitive) → reject unreadable rows with reason |
| 4 | `core.cleanCsv` | Detect interval (most common gap), snap off-grid timestamps, group by service + slot, merge (failure wins, valid beats invalid) |
| 5 | `core.incidents` / `core.sla` | Incidents (failures at most 1 h apart, ≥ 2 in a row), per-service stats, hourly failure counts |
| 6 | Lambda → Neon | **One transaction**: insert `uploads`, bulk-insert `checks` (batches of 5,000 via `unnest`), `rejected_rows`, `service_stats`, `hourly_failures`, `incidents`; commit |
| 7 | Lambda | Return `201` + upload summary (counts, detected facts, fixes, first 10 rejected rows) |

Nothing is written if any step fails (rollback) — the browser shows the error, the upload list is unchanged.

---

## Database schema

```sql
create table uploads (
  id              uuid primary key default gen_random_uuid(),
  file_name       text not null,
  file_sha256     text not null unique,
  uploaded_at     timestamptz not null default now(),
  range_start     timestamptz not null,
  range_end       timestamptz not null,
  interval_min    int not null,
  services        int not null,
  rows_total      int not null,
  rows_stored     int not null,     -- checks after merge
  rows_merged     int not null,     -- duplicate reports folded into a check
  rows_fixed      int not null,     -- stored checks that needed a fix
  rows_rejected   int not null,
  expected_checks int not null,
  issues          jsonb not null    -- {"epoch":233,"offset":109,"unit":{"s":3090},"latMissing":186,...}
);

create table checks (
  upload_id     uuid not null references uploads(id) on delete cascade,
  service_id    text not null,
  slot_ts       timestamptz not null,
  status_code   int  not null,
  is_valid      boolean not null,        -- false for 999 etc. (left out of availability)
  is_failed     boolean not null,        -- 500–599
  latency_ms    int,                     -- null = blank or negative
  agents        text[] not null,
  region        text,
  quality_flags text[] not null,         -- {epoch_ts, offset_ts, unit_converted, merged, latency_missing, latency_negative, invalid_status, snapped}
  primary key (upload_id, service_id, slot_ts)
);
create index checks_time   on checks (upload_id, slot_ts);
create index checks_failed on checks (upload_id, slot_ts) where is_failed;

create table rejected_rows (upload_id uuid references uploads(id) on delete cascade, line_no int, raw text, reason text);

create table services       (upload_id uuid, service_id text, service_name text, primary key (upload_id, service_id));
create table service_stats  (upload_id uuid, service_id text, valid int, failed int, present int, availability numeric,
                             downtime_min int, p50_ms int, p95_ms int, incidents int, longest_incident_min int,
                             primary key (upload_id, service_id));
create table hourly_failures(upload_id uuid, service_id text, hour_ts timestamptz, checks int, failed int,
                             primary key (upload_id, service_id, hour_ts));
create table incidents      (upload_id uuid, service_id text, start_ts timestamptz, end_ts timestamptz,
                             failed int, median_latency_ms int, normal_latency_ms int);
```

The raw CSV is **not** stored (free-tier storage); `rejected_rows` keeps the lines that could not be read,
`checks.agents` + `quality_flags` keep the audit trail of what was merged or fixed.

---

## API

All responses JSON. All list endpoints are **paged**; the browser never receives raw checks in bulk.

| Method & path | Returns | Chunking |
|---|---|---|
| `POST /uploads` (gzip body, `x-file-name`) | upload summary | 201 / 200 duplicate / 400 / 413 / 422 |
| `GET /uploads?cursor&limit=20&q` | upload list with counts + missed-SLA | cursor |
| `GET /uploads/:id` | upload + detected facts + issues (data report) | — |
| `GET /uploads/:id/stats` | stat strip (missed, allowed, incidents, lowest, stored) | — |
| `GET /uploads/:id/services?q&cursor&limit=5` | service rows, worst first | cursor, server search |
| `GET /uploads/:id/services/:sid/hex?from&days` | hourly failure counts for one day-page | day window |
| `GET /uploads/:id/timeline?bins=240&offset&limit=10` | per-service failure counts per bin | fixed bins × 10 services |
| `GET /uploads/:id/incidents?cursor&limit=50` | incident rows | cursor |
| `GET /uploads/:id/checks?from&to&service&agent&region&status&sort&cursor&limit=10` | log rows | keyset cursor `(slot_ts, service_id)` |
| `GET /health` | `{ ok, db }` | — |

**Why cursors:** `OFFSET` gets slower the deeper you page; a keyset cursor stays constant-time at 400k rows.

**Frontend caching:** TanStack Query keys = endpoint + params; stale time 5 min (uploads are immutable);
next log page prefetched; in-flight requests cancelled when filters change.

---

## Folder structure

```
/
├─ README.md                    reviewer-facing (brief's 5 sections)
├─ .githooks/                   pre-commit · commit-msg · pre-push (enabled by npm install → prepare script)
├─ scripts/checks/              rules.js (architecture + security rules), hook scripts, claude-guard.js
├─ data/
│  ├─ samples/                  the 5 sample CSVs + dataset_incident_log.json (test fixtures)
│  └─ stress/                   generated stress CSVs + stress_incident_log.json (not committed)
├─ packages/
│  └─ core/                     PURE TypeScript — no I/O, no framework
│     ├─ src/constants.ts       every tunable number (SLA target, incident gap, units)
│     ├─ src/types.ts           Check, CleanResult, ServiceStat, Incident, HourlyFailure
│     ├─ src/csv.ts · timestamp.ts · row.ts   line splitting, UTC parsing, row validation
│     ├─ src/clean.ts           cleanCsv(): validate · detect interval · snap · merge
│     ├─ src/sla.ts             availability, downtime, allowance, p50/p95, coverage
│     ├─ src/incidents.ts       incident grouping
│     ├─ src/hourly.ts          hourly failure counts (hex map, timeline)
│     ├─ src/batch.ts           batches() helper for Lambda writes
│     └─ test/                  fixture tests on data/samples/ and data/stress/
├─ services/
│  └─ api/                      AWS Lambda
│     ├─ src/handler.ts         Function URL entry → router
│     ├─ src/routes/            one file per endpoint (thin: parse input → call → respond)
│     ├─ src/db/                client, queries (SQL only here), migrations/*.sql
│     ├─ src/lib/               errors, validation, logging
│     └─ template.yaml          SAM
├─ apps/
│  └─ web/                      React + Vite (Vercel)
│     └─ src/
│        ├─ api/                typed client + TanStack Query hooks (only place that calls fetch)
│        ├─ components/         reusable UI: Panel, StatStrip, Pill, Chip, Tabs, InfoPopover, Skeleton, Dialog
│        ├─ features/           dashboard/, hexmap/, timeline/, incidents/, logs/, uploads/, report/
│        ├─ lib/                format (fmtMin, nf), time (UTC helpers)
│        └─ styles/tokens.css   the only place colours/fonts are defined
└─ .claude/
   ├─ docs/problem_statement.md the assignment brief (source of truth for scope)
   ├─ product-requirement/ · design/ · architecture/ · rules/ · security/
   └─ commands/                 /generate-stress (+ generate-stress.js)
```

---

## Architectural rules

1. **`packages/core` is pure.** No network, database, React or AWS imports. Everything testable with a string in, objects out.
2. **Business rules live once.** SLA, incident and cleaning logic only in `core`; SQL and UI never re-implement them.
3. **Routes are thin.** Parse input → call `core` / `db` → shape response. No business logic in handlers.
4. **SQL only in `services/api/src/db`.** Parameterised queries only.
5. **The UI never calls `fetch` directly.** Only `apps/web/src/api`.
6. **Components get data via props;** features own data fetching.
7. **Uploads are immutable.** Re-processing = new upload; nothing updates checks in place.
8. **Every list is paged;** no endpoint returns an unbounded array.

---

## Decisions (ADR)

| # | Decision | Reason |
|---|---|---|
| ADR-001 | AWS Lambda for the cleaning function | Named in the brief; free tier; real serverless |
| ADR-002 | Neon Postgres | Free, serverless Postgres; SQL suits date filters, aggregation, keyset paging |
| ADR-003 | Vercel for the web app | Free static hosting with instant deploys |
| ADR-004 | TypeScript end to end | One language to explain; `core` shared by API and tests |
| ADR-005 | Browser gzip + Function URL | Fits 50 MB CSVs in Lambda's 6 MB limit; avoids API Gateway's 29 s cap; no S3 needed |
| ADR-006 | Each upload stored separately, never merged | Sample files overlap in time and contradict each other (130–216 status disagreements) |
| ADR-007 | Pre-aggregated tables (`service_stats`, `hourly_failures`, `incidents`) | Dashboard reads stay small and fast regardless of upload size |
| ADR-008 | 5xx = down, 4xx = up, invalid excluded, failure wins | Literal reading of "the data decides"; documented in README Assumptions |
| ADR-009 | Whole-upload period, not calendar month | Files span 9–90 days and don't align to months; month split listed under "more time" |
| ADR-010 | No raw CSV storage | Free-tier storage; rejected rows + quality flags keep the audit trail |
| ADR-011 | **Batch processing in Lambda:** checks, rejected rows and summaries are written in batches of **5,000 rows** (`core.batches()` + one `INSERT … SELECT FROM unnest(…)` per batch) inside **one transaction** | Memory and query size stay flat from 4k to 460k rows; one failed batch rolls back the whole upload |
| ADR-012 | **TanStack Query for all server data in the web app** (queries, infinite queries, prefetch, cancellation) | One caching/paging layer for every panel; components render from query state (loading · error · data) |

---

## Deployment

| Piece | How |
|---|---|
| Database | Create Neon project → run `services/api/src/db/migrations/*.sql` |
| API | `sam build && sam deploy --guided` (params: `DatabaseUrl`, `AllowedOrigin`); output = Function URL |
| Web | Vercel project on `apps/web`, env `VITE_API_URL=<Function URL>` |
| Guards | Lambda reserved concurrency 5; AWS Budget alert $1; CORS = Vercel domain |

Environment variables are listed in `.env.example` (never real secrets in git).
