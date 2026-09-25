# Security — SLA Watch

> Security requirements for the upload pipeline, API, database and web app.
> Scope in [REQUIREMENTS.md](../product-requirement/REQUIREMENTS.md), system in
> [ARCHITECTURE.md](../architecture/ARCHITECTURE.md), coding rules in [RULES.md](../rules/RULES.md).

---

## Context

- **No authentication, by design.** The brief rules out user accounts, so the app is **public**: anyone with the
  URL can upload a file and read every upload.
- There is **no personal data**: the CSVs hold service names, timestamps, status codes and latencies.
- The main risks are therefore **not data theft** but **abuse and breakage**:
  running up cloud costs, crashing the function, corrupting stored data, or injecting script into the dashboard.

## Threat model

| # | Threat | Where | Impact | Mitigation |
|---|---|---|---|---|
| T1 | Oversized upload / request flood | `POST /uploads` | Lambda cost, Neon storage full, function timeouts | Body ≤ 6 MB (Lambda limit), raw file ≤ 50 MB, reserved concurrency 5, $1 budget alert |
| T2 | **Gzip bomb** (tiny gzip → huge output) | Lambda gunzip | Memory exhaustion, crash | Stream gunzip with a **hard cap of 50 MB decompressed**; abort → 413 |
| T3 | Malformed / hostile CSV (huge lines, millions of columns, binary) | `core.cleanCsv` | Crash, CPU burn | Max line length 4 KB, max 1,000,000 rows, header must match required columns (422), per-row validation, reject non-UTF-8 |
| T4 | SQL injection | `services/api/db` | Data loss / leak | Parameterised queries only; no string-built SQL; identifiers never from input |
| T5 | Stored XSS via CSV values (service names, agents, regions) | Web UI | Script runs in viewers' browsers | React escapes text by default; **never** `dangerouslySetInnerHTML` with data; CSP blocks inline scripts |
| T6 | CSV / formula injection (`=HYPERLINK(...)`) | Any future export | Code in a reviewer's spreadsheet | Not exported today; if export is added, prefix cells starting with `= + - @` with `'` |
| T7 | Secret leakage (`DATABASE_URL`) | Git, logs, client bundle | Full database access | Secrets only in SAM parameters / Vercel env; never `VITE_`-prefixed; `.env` git-ignored; never logged |
| T8 | Cross-site use of the API | Browser | Other sites driving uploads | CORS allow-list = the Vercel domain only |
| T9 | Duplicate / replayed uploads | `POST /uploads` | Storage growth | SHA-256 of the file is unique; re-upload returns the existing upload (200) |
| T10 | Information leakage in errors | API responses | Stack traces, SQL text exposed | Typed `HttpError` messages only; unexpected errors → generic 500 + request id; details only in logs |
| T11 | Vulnerable dependencies | npm packages | Remote code execution | Few dependencies, lockfile committed, `npm audit --audit-level=high` before each deploy |
| T12 | Partial writes on failure | Neon | Corrupt / half-saved uploads | One transaction per upload; rollback on any error |

---

## Requirements

### Input validation (upload)

- [ ] Accept only `.csv` / `text/csv`; check in the browser **and** in Lambda (the browser check is convenience only).
- [ ] Request body ≤ **6 MB** gzip; decompressed ≤ **50 MB**; rows ≤ **1,000,000**; line ≤ **4 KB**.
- [ ] Decode as UTF-8; reject files with NUL bytes or invalid encoding (400).
- [ ] Required columns present (422, list what is missing); unknown extra columns ignored.
- [ ] Every field trimmed and length-capped (service id/name ≤ 200 chars, agent/region ≤ 100).
- [ ] Unreadable rows are **rejected with a reason**, never guessed.
- [ ] `x-file-name` header sanitised: basename only, ≤ 200 chars, shown as text.

### API

- [ ] CORS: `Access-Control-Allow-Origin` = the Vercel URL only; methods `GET, POST`; no credentials.
- [ ] All query parameters validated (UUIDs, ISO dates, enums, integers); `limit` capped (logs 50, services 20, uploads 50).
- [ ] Parameterised SQL only.
- [ ] Error bodies: `{ error: "<plain message>", requestId }` — no stack traces, no SQL.
- [ ] Only `GET` endpoints plus `POST /uploads`; **no** update or delete endpoints (uploads are immutable).

### Secrets & configuration

- [ ] `DATABASE_URL` lives only in the SAM parameter (encrypted Lambda env) and local `.env`.
- [ ] The web app gets **only** `VITE_API_URL` (public by nature).
- [ ] `.env`, `.env.*` (except `.env.example`) and `services/api/env.json` (SAM local) in `.gitignore`; `.env.example` holds names, never values.
- [ ] Database connection uses TLS (`sslmode=require`, Neon default).
- [ ] A dedicated Neon role for the API with rights on this schema only (no superuser).

### Web app

- [ ] Content Security Policy via `vercel.json`:
      `default-src 'self'; connect-src 'self' <api-url>; font-src fonts.gstatic.com; style-src 'self' fonts.googleapis.com 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'`.
- [ ] Headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- [ ] All CSV-derived text rendered as text (React default); no `innerHTML` with data.
- [ ] HTTPS only (Vercel default).

### Cost & availability guards

- [ ] Lambda **reserved concurrency = 5**; timeout 120 s; memory sized for a 50 MB file.
- [ ] AWS Budget alert at **$1**.
- [ ] Neon free-tier limits monitored; uploads rejected with a clear message if storage is near the limit.

### Logging

- [ ] One JSON line per request: `{ requestId, route, uploadId, status, ms, rows }`.
- [ ] Never log file contents, full rows, or `DATABASE_URL`.
- [ ] CloudWatch log retention: 14 days.

### Dependencies

- [ ] Lockfiles committed; minimal dependency list.
- [ ] `npm audit --audit-level=high` passes before each deploy.

---

## Accepted risks (documented, out of scope)

| Risk | Why accepted |
|---|---|
| Anyone can upload and view all uploads | Authentication is explicitly out of scope; data is non-sensitive |
| No per-IP rate limiting | Reserved concurrency + budget alert cap the worst case at free-tier cost; per-IP limits need API Gateway/WAF |
| No deletion of uploads | Immutability keeps the audit trail; deletion listed under "more time" |

## Security tests

- [ ] Upload a 7 MB body → **413**; a gzip bomb (1 MB → 1 GB) → **413**, function stays healthy.
- [ ] CSV with `<script>alert(1)</script>` as a service name → shown as literal text in every view.
- [ ] Query params with `' OR 1=1 --` → 400 or empty result, never an SQL error.
- [ ] Request from a non-allowed origin → blocked by CORS.
- [ ] Forced DB error → response has no stack trace or SQL.
- [ ] Re-upload the same file → 200 `duplicate: true`, no new rows.
- [ ] `git grep -i "postgres://"` finds nothing.
