# SLA Watch — SLA Monitoring Dashboard

Upload a CSV of health-check logs → a serverless function cleans it → the result is stored in Postgres →
a single-screen dashboard shows per-service SLA stats (collapsible) and every check (filterable by date).

| | |
|---|---|
| **Live app** | _Phase 3: React frontend (to deploy to Vercel)_ |
| **API** | _Phase 2 complete_: AWS Lambda function with Neon Postgres (ready to deploy via `sam deploy`) |
| **Core logic** | _Phase 1 complete_: 91 tests passing, all 5 samples + stress files verified |
| **Last verified live** | _not deployed yet — Phase 3 (web) pending_ |
| **Design mockup** | https://claude.ai/artifact/Eusqy1vCS2BjZQnZqZWHC2 |

---

## 1. Architecture

```
Browser (React on Vercel) ──gzip CSV──▶ AWS Lambda (Node 20, Function URL) ──one transaction──▶ Neon Postgres
          ▲                                  clean · validate · merge · incidents · summaries          │
          └──────────── small, paged, pre-aggregated reads (stats · services · hex · logs) ◀───────────┘
```

| Piece | Runs on | Why this choice |
|---|---|---|
| Upload UI + dashboard | **React + Vite + TypeScript** on **Vercel** (free) | Static hosting, instant deploys; TanStack Query gives caching, paging and cancellation |
| Cleaning function | **AWS Lambda** (Node 20, TypeScript) behind a **Function URL**, deployed with **SAM** | A real stateless function as the brief requires; Function URL avoids API Gateway's 29 s limit |
| Database | **Neon Postgres** (free) | SQL fits date-range filters, aggregation and cursor paging; serverless driver |
| Shared logic | `packages/core` (pure TypeScript) | Cleaning, SLA and incident rules exist once and are tested on the real files |

**Large files:** the browser gzips the CSV (~10× smaller), so a 50 MB file fits Lambda's 6 MB request limit.
The function decompresses it (capped at 50 MB), cleans it in memory (~4 s for 464k rows) and writes it in
batches of 5,000 rows inside one transaction; dashboard endpoints read
small pre-computed tables (`service_stats`, `hourly_failures`, `incidents`) and page everything else.
Details: [`.claude/architecture/ARCHITECTURE.md`](.claude/architecture/ARCHITECTURE.md).

---

## 2. Data findings

All five sample files in [`data/samples/`](data/samples/) were checked row by row. Every issue below appears in **every** file.

**What is clean:** 8 columns in every row; exactly 5 services; `service_id` ↔ `service_name` always 1:1;
region always `ap-south-1`; after converting to UTC every timestamp sits on the 15-minute grid, every gap is
exactly 15 min, and every service has **exactly 96 checks per day** — the extra rows are all duplicates.

| # | Issue | 9d | 12d | 14d | 21d | 30d | How it's handled |
|---|---|---|---|---|---|---|---|
| 1 | Unix epoch timestamps (seconds) | 70 | 93 | 109 | 163 | 233 | Converted to UTC |
| 2 | ISO timestamps with `+05:30` offset | 32 | 43 | 50 | 76 | 109 | Converted to UTC using the offset in the value |
| 3 | Second agent reporting the same service + slot | 345 | 460 | 537 | 806 | 1,153 | Merged into one check (failure wins) |
| 4 | Exact duplicate lines | 6 | 8 | 10 | 18 | 24 | Dropped |
| 5 | Same check repeated in a different timestamp format | 1 | 2 | 0 | 0 | 1 | Caught by merging on the UTC slot |
| 6 | search-api latency in seconds (`s`) | 935 | 1,242 | 1,452 | 2,184 | 3,131 | × 1000 → ms |
| 7 | Blank latency | 56 | 74 | 87 | 130 | 186 | Check kept, latency empty; status still counts |
| 8 | Negative latency | 1 | 1 | 1 | 1 | 1 | Latency removed (not a flipped sign: the value is outside the normal range) |
| 9 | Invalid status `999` | 1 | 1 | 1 | 1 | 1 | Left out of availability; in the 14-day file agent-2 reported `200` for that slot, so that is used |
| | **Rows → checks stored** | 4,672 → **4,320** | 6,230 → **5,760** | 7,269 → **6,720** | 10,904 → **10,080** | 15,577 → **14,400** | = 5 services × days × 96 |

<sub>Counts are **rows in the file**, before exact duplicates are dropped. The cleaner's own report counts rows it actually converted, so it is slightly lower (e.g. 30-day file: 3,131 rows in `s`, of which 3,090 have a latency value to convert; the rest are blank or duplicates).</sub>

**Other findings**
- **Agents never disagree on status** except the single `999`; their latency differs by ~3.5% (max 7.8%) —
  two independent probes of the same thing.
- **All 8 incidents** in [`data/samples/dataset_incident_log.json`](data/samples/dataset_incident_log.json) are real in the data: 50–89% of checks fail inside each
  window and latency jumps 3–4× normal. Every latency outlier in all files falls inside one of them.
- **Most failures are not incidents:** ~1% of checks fail as isolated singles (e.g. 30-day file: 182 failures,
  25 inside incidents). reports-api is consistently the flakiest (~2–2.6%).
- **The files overlap in time and contradict each other** (12d/21d/30d share weeks; 130–216 up/down
  disagreements for the same service and timestamp) — so uploads are stored separately, never merged.
- **Traps:** reading `+05:30` as UTC silently shifts rows 5 h 30 min *and still lands on the grid* (25–99 fake
  gaps); keeping only `…Z` rows loses 89–297 real checks; reading epoch as ms lands in January 1970.

**Stress files** ([`.claude/commands/generate-stress.js`](.claude/commands/generate-stress.js), run with `/generate-stress` → `data/stress/`, same kinds of mess at larger scale)

| File | Rows → checks | Findings handled |
|---|---|---|
| small — 10 services, 14 days | 14,451 → 13,403 | 37 missing checks (gaps) |
| chaos — 30 services, 30 days | 92,656 → 86,128, **0 rejected** | 495 padded fields trimmed · 914 upper-case units (`S`, `MS`) · 276 × 4xx · 3 agents · 4 regions · 62-character names |
| large — 50 services, 90 days | 463,637 → 430,738 | 1,262 gaps; cleaned in ~4 s. Found a real crash (`Math.min(...rows)` stack overflow) — fixed |

---

## 3. Assumptions

| Where the brief is ambiguous | Choice | Why |
|---|---|---|
| What counts as downtime | **Every 5xx check** = one interval (15 min) of downtime | "The data itself decides" — no smoothing policy invented |
| 4xx responses | **Up** | The service answered; a client error is not an outage |
| Invalid status (`999`) | Excluded from availability (unless another agent has a valid status for that slot) | Neither up nor down is supported by the data |
| Two agents disagree | A valid **failure wins** | Customer-favourable; only ever happened with `999` in the samples |
| "Monthly" availability | Calculated over the **whole uploaded period** | Files span 9–90 days and don't align to calendar months |
| Credit amount | Not calculated; the dashboard shows **credit eligible** (Missed) | The brief gives no credit tiers |
| Missing checks | "No data", **not** downtime; shown as coverage < 100% | Absence of evidence isn't a failure |
| Multiple uploads | Each stored and shown **separately** | Sample files contradict each other for the same timestamps |
| Incidents | Failures at most 1 h apart with ≥ 2 in a row; for on-call only, never change SLA numbers | Matches all 8 logged incidents; separates outages from noise |
| Latency percentiles | From successful checks with a usable latency | Failed and blank latencies would distort p50/p95 |

**Stats shown, and why**

| Stat | Who it's for |
|---|---|
| Services that missed 99.9% (credit eligible) | Billing |
| Allowed downtime (e.g. 43.2 min per service for 30 days) | Billing — puts downtime in context |
| Incidents (count, longest) | On-call |
| Lowest availability (worst service) | Both |
| Checks stored / rows / rejected | Trust in the numbers |
| Per service: availability, Met/Missed, downtime (× allowance), incidents, p50/p95, coverage | Billing + on-call |
| Hex map (failures per hour), timeline, incidents list | On-call: *when* things failed |

---

## 4. Run and redeploy

**Prerequisites:** Node 20, AWS CLI + SAM CLI, a Neon project, a Vercel account.

```bash
# install (also enables the git checks: pre-commit, commit-msg, pre-push)
npm install

# tests (cleaner on all sample + stress files)
npm test

# database
psql "$DATABASE_URL" -f services/api/src/db/migrations/001_init.sql

# API (AWS Lambda) — prints the Function URL
cd services/api && sam build && sam deploy --guided   # params: DatabaseUrl, AllowedOrigin

# API (local) — needs Docker. Put DATABASE_URL in services/api/env.json (git-ignored; names in .env.example)
cd services/api && sam build && sam local start-api --env-vars env.json   # http://127.0.0.1:3000

# web (local)
cd apps/web && VITE_API_URL=<function-url> npm run dev

# web (deploy)
vercel --prod   # project root: apps/web, env VITE_API_URL
```

**If the free-tier resources were paused or deleted:** re-run the three deploy steps above (≈ 5 minutes);
Neon free projects wake automatically on the first request.

---

## 5. What I'd do with more time

- **Calendar-month SLA** with credit tiers (10% / 25% / 100%) and a billing export.
- **Configurable downtime rule** (e.g. ignore single isolated failures) with both numbers shown side by side.
- **Zoomable timeline** (drag to select a range → finer bins from the API).
- **Streaming ingestion** (S3 + multipart) for files beyond 50 MB, and async processing with progress.
- **Alerting**: notify on-call when a new upload contains an incident.
- **Keyboard navigation** for the timeline and Full view (the hex map already has it).
- **Retention** job and raw-file archive once storage isn't free-tier bound.

---

<sub>The assignment brief is [`.claude/docs/problem_statement.md`](.claude/docs/problem_statement.md). Docs for contributors (requirements, design, architecture, coding rules, security) live in [`.claude/`](.claude/).</sub>
