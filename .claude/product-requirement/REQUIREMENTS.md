# Requirements — SLA Watch

> **What we are building and why.** For *how* it works see [ARCHITECTURE.md](../architecture/ARCHITECTURE.md);
> for *how it looks* see [DESIGN.md](../design/DESIGN.md); for *how we write the code* see [RULES.md](../rules/RULES.md).
> Source of truth for scope: [`problem_statement.md`](../docs/problem_statement.md).

---

## Product

**SLA Watch** — a web app that turns raw health-check CSVs into trustworthy SLA numbers.
A user uploads a monitoring file; a cloud function cleans it; the result is stored and shown
on a single-screen dashboard with collapsible stats and filterable logs.

## Problem

Cloud providers promise *"if a service's monthly availability drops below 99.9%, the customer gets a
billing credit."* The credit is computed automatically from monitoring data — nobody reviews it by hand.
The raw data is messy (mixed time formats, duplicate reports from two agents, mixed units, invalid values),
so the pipeline that turns rows into numbers must be **correct, explainable and auditable**, and people need
one place to see what happened.

## Target users

| User | What they need from the dashboard |
|---|---|
| **Billing** | Which services missed 99.9%, by how much, and are they eligible for a credit |
| **On-call engineer** | When failures happened, which were real outages (incidents), latency during them |
| **Support / auditor** | Proof: every check, every fix the cleaner made, every rejected row and why |

## Goal

Upload any monitoring CSV of this shape → see correct per-service availability, SLA status, incidents and
every underlying check within seconds, with every number traceable to the rows behind it.

---

## Core features

1. **Upload** a CSV (drag & drop or file picker) and watch it being processed.
2. **Clean** it in a deployed serverless function using general rules (nothing hard-coded to the sample files).
3. **Store** each upload separately so it can be queried later.
4. **Dashboard – Stats** (collapsible): SLA verdict, per-service KPIs, hex map, timeline, incidents.
5. **Dashboard – Logs**: every check, filterable by a single date or a date range (plus service, agent, region).
6. **Data report**: what was detected and fixed for each upload.

---

## MVP scope

### 🔴 Must have — required by the brief (the submission fails without these)

| # | Item | Source |
|---|---|---|
| M1 | Upload screen: choose a CSV and send it | Brief: "Upload UI" |
| M2 | Cloud function really deployed (AWS Lambda) that parses, validates and cleans | Brief: "required part of the architecture" |
| M3 | Cleaner handles the data problems: timestamps, duplicates, units, bad latency, `999` | Brief: "finding and handling its problems is part of the assignment" |
| M4 | Database persistence (Neon Postgres), queryable after the upload | Brief: "has to be re-queryable" |
| M5 | Dashboard: collapsible stats at the top | Brief |
| M6 | Dashboard: logs below, filterable by a single date **or** a date range | Brief |
| M7 | Number of days, services and the check interval detected from the data, never assumed | Brief: "don't assume" |
| M8 | Everything live at public URLs (Vercel + Lambda + Neon) | Brief: "must deploy and host this for real" |
| M9 | Free tier only | Brief |
| M10 | GitHub repo, committed as we go | Brief: "we read commit history" |
| M11 | README: architecture, data findings, assumptions, live URL, run/redeploy, what we'd improve | Brief: 5 required sections |
| M12 | Every line explainable | Brief: "can't be explained is treated as a failure" |

### 🟠 Should have — not named in the brief, but reviewers will judge on them

| # | Item | Why it matters |
|---|---|---|
| S1 | Cleaner tests on all 5 sample files (checks = services × days × 96) + stress files | Proves the cleaning is correct |
| S2 | Written SLA rules (5xx = down, 4xx = up, `999` excluded, failure wins a conflict) | Decides the billing credit; goes in Assumptions |
| S3 | One transaction per upload; **batch processing** in Lambda (inserts in batches of 5,000 rows) | No half-saved data if something fails; memory stays flat on large files |
| S4 | Clear errors: bad file (400), too large (413), wrong columns (422) | "Validates" is in the brief |
| S5 | Pagination and filters done in SQL (10 log rows per page, cursor-based) | Stays fast at 400k+ checks |
| S5b | **TanStack Query** renders all server data (cache, infinite scroll, prefetch, cancel on filter change) | Consistent loading/error states; no duplicate fetch logic |
| S6 | Cleaning report saved with each upload | Powers the data report and the README findings |
| S7 | Upload picker (latest by default); uploads never mixed | Files overlap in time and contradict each other |
| S8 | SAM template: one-command redeploy | Brief: "how to redeploy it on demand" |
| S9 | Per-service KPIs: availability, SLA, credit, downtime, incidents, p50/p95, coverage | Billing + on-call needs (see table below) |
| S10 | Incidents view + outlines on the hex map / bands on the timeline | On-call can separate outages from noise |
| S11 | Large data handled in chunks (paged APIs, binned timeline, infinite-scroll service list, server search, cache) | Stress files reach 50 services × 90 days |
| S12 | Accessibility: WCAG 2.2 AA contrast, keyboard-navigable chart, reduced motion | Standard review checkpoint |

### 🟢 Nice to have — polish (do last, or list under "with more time")

| # | Item | Value |
|---|---|---|
| N1 | Duplicate-upload check (SHA-256 of the file) | Re-uploading doesn't duplicate data |
| N2 | CORS limited to the Vercel domain | Basic safety without auth |
| N3 | Lambda concurrency capped at 5 + a $1 AWS budget alert | No surprise costs |
| N4 | `GET /health` route | Quick live check |
| N5 | Structured CloudWatch logs | Easier debugging |
| N6 | Incident-log fixture test (`data/samples/dataset_incident_log.json`) | Proves failures land in the logged windows |
| N7 | Full view of the hex chart, dark mode, transitions | Already designed; low effort |

---

## Per-service KPI list (what the stats must show)

| KPI | Per | For | Where in the UI |
|---|---|---|---|
| Availability % | service | billing | service list, chart header, timeline |
| SLA met? (≥ 99.9%) | service | billing | Met / Missed pill |
| Credit eligible | service | billing | "Missed · credit" pill |
| Downtime (+ × allowance) | service | on-call, billing | chart header, timeline |
| Incident count + longest | service | on-call | chart header, incidents view |
| Incident list (start, end, duration, latency) | upload | on-call | Incidents view |
| p50 / p95 latency | service | on-call | chart header |
| Data coverage % (present ÷ expected checks) | service | trust | chart header |
| Rows uploaded / stored / fixed / rejected | upload | trust | stat strip, data report |

---

## Out of scope (explicitly — from the brief)

- Authentication / user accounts
- Multi-tenant support
- CI pipelines
- Paid resources of any kind
- Calendar-month billing split and credit-amount tiers (the brief gives no tiers; see Assumptions in README)

---

## Business rules (must be implemented exactly)

| Rule | Definition |
|---|---|
| Check | One row per service per detected interval slot (15 min in all sample files) after cleaning |
| Failed check | Status **500–599** |
| 4xx | Counts as **up** (the service answered) |
| Invalid status (e.g. `999`) | Left out of availability; if another agent reported a valid status for the same slot, use it |
| Duplicate reports | Same service + slot from several agents/lines → one check; a valid failure wins over a valid success |
| Availability | (valid checks − failed checks) ÷ valid checks, per service, over the whole upload |
| Downtime | failed checks × interval |
| Allowed downtime | expected slots × interval × 0.1% |
| SLA | Met if availability ≥ 99.9%, else **Missed → credit eligible** |
| Incident | Failures at most 1 hour apart, grouped; counts when ≥ 2 checks in a row failed. On-call only — never changes SLA numbers |
| Missing slot | Gap = no data, **not** downtime; shown as coverage < 100% |
| Latency percentiles | From successful checks with a usable latency only |

---

## Success criteria (acceptance)

- [ ] All 5 sample files upload successfully and store exactly **services × days × 96** checks
      (4,320 / 5,760 / 6,720 / 10,080 / 14,400).
- [ ] 0 rows rejected on the 5 sample files and on `stress_chaos`; all 8 incidents in `data/samples/dataset_incident_log.json` are detected.
- [ ] `stress_large` (463,637 rows) is accepted and stored without timeouts.
- [ ] Wrong-column file → nothing saved, clear message listing missing columns.
- [ ] Logs filter by single date and by date range return the correct rows (checked in SQL tests).
- [ ] Stats panel collapses/expands; the whole stats panel fits a 780 px-tall screen without scrolling.
- [ ] Live URLs for web and API work at review time; README states when last verified.
- [ ] Lighthouse accessibility ≥ 95; grey text ≥ 4.5:1; chart operable by keyboard.
