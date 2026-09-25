# Rules — SLA Watch

> The rulebook for anyone (human or AI agent) writing code in this repo.
> Read [ARCHITECTURE.md](../architecture/ARCHITECTURE.md) and [DESIGN.md](../design/DESIGN.md) first.
> If a rule blocks you, change the rule in this file in the same commit — don't silently break it.

---

## General

- TypeScript everywhere, `strict: true`. No `any` without a comment saying why.
- **Reuse before you write.** Search `packages/core`, `apps/web/src/components`, `apps/web/src/lib` first.
- **Never duplicate logic.** If the same rule is needed twice, move it to `core` (logic) or `components` (UI).
- Small, pure functions; one job each. Files over ~250 lines are a sign to split.
- Names say what things are in the user's words: `failedChecks`, `allowedDowntimeMin`, not `cnt2`, `tmp`.
- No magic numbers: `SLA_TARGET = 99.9`, `INCIDENT_MAX_GAP_MIN = 60`, `INCIDENT_MIN_RUN = 2` live in `packages/core/src/constants.ts`; UI constants (e.g. `SVC_PAGE = 5`) in one web constants file.
- Every line must be explainable in an interview. No copied code you can't defend.

## Before coding

- [ ] Find the requirement it serves in `REQUIREMENTS.md` (M/S/N number) — if none, don't build it.
- [ ] Check `ARCHITECTURE.md` for where it belongs (core / api / web) and which endpoint it uses.
- [ ] Check `DESIGN.md` for the component/pattern; reuse the existing one.
- [ ] Write or update the test first for anything in `core`.

## Architecture boundaries (enforced in review)

| Layer | May import | Must not |
|---|---|---|
| `packages/core` | nothing but the standard library | fetch, db, React, AWS SDK, `Date.now()` in rules (pass time in) |
| `services/api/routes` | `core`, `db`, `lib` | contain SLA / cleaning logic, build SQL strings |
| `services/api/db` | `pg` / Neon driver | business rules; string-concatenated SQL |
| `apps/web/features` | `api` hooks, `components`, `lib` | call `fetch`, compute SLA numbers the API already returns |
| `apps/web/components` | `lib`, tokens | fetch data, know about endpoints |

## Data & business rules (single source: `packages/core`)

- Failed = 500–599. 4xx = up. Invalid status (outside 100–599) = excluded from availability.
- Merge per service + slot: valid failure wins; valid beats invalid; keep the first usable latency.
- Downtime = failed × interval. Allowed = expected slots × interval × 0.1%.
- Incident = failures at most 1 hour apart, ≥ 2 in a row. Never changes SLA numbers.
- Gaps are "no data", never downtime.
- **Never assume** days, services, agents, regions or the interval — detect them from the file.
- Timestamps: store and compute in **UTC only**; format for display at the edge (UI).
- Changing any of these = update `REQUIREMENTS.md` business rules + README Assumptions + tests in the same commit.

## Backend (Lambda)

- Handlers are thin: validate input → call core/db → return. Errors are thrown as typed `HttpError(status, message)`.
- Status codes: 400 bad input · 404 not found · 413 too large (body or decompressed) · 422 wrong columns · 500 unexpected.
- Error bodies are `{ error, requestId }` only — never stack traces or SQL.
- One transaction per upload; write in batches with `core.batches(rows, BATCH_SIZE)` (5,000 rows, one `unnest` insert per batch); never one INSERT per row; roll back on any error.
- Every list endpoint takes `cursor` + `limit` and caps `limit` (logs 50, services 20, uploads 50).
- Parameterised SQL only. Never interpolate user input into SQL.
- Log one structured JSON line per request: `{ route, uploadId, ms, rows, status }`. Never log file contents.
- Big arrays: loops, not `Math.max(...arr)` (stack overflow at ~100k items — found in stress testing).

## Frontend (UI)

- Colours, fonts, radii, spacing only from `styles/tokens.css`. No hex values in components.
- Use the shared components: `Panel`, `StatStrip`, `Pill`, `Chip`, `Tabs`, `InfoPopover`, `Skeleton`, `Dialog`, `EmptyState`.
- Every data view handles **loading, empty, error** (and partial where relevant) — see DESIGN.md.
- Data fetching only through `api/` hooks built on **TanStack Query** (`useQuery`, `useInfiniteQuery`, `prefetchQuery`). Keys = endpoint + params. Cancel on filter change. Components render from query state; no `useEffect` + `fetch`.
- Lists: paged or infinite-scrolled; never render thousands of rows.
- Layout laws: one level of panels; lines, not nested boxes; charts fit their box; whole rows only.
- Motion ≤ 350 ms, respect `prefers-reduced-motion`; never animate content that may start hidden.
- Accessibility: every button named, every input labelled, text ≥ 4.5:1, keyboard reachable, never colour alone.

## Security

Full threat model, requirements and security tests: [SECURITY.md](../security/SECURITY.md).

- No auth by design (out of scope) → the API is read-mostly and public: CORS locked to the Vercel domain,
  body limit 6 MB (gzip), **50 MB decompressed cap** (gzip-bomb guard), ≤ 1,000,000 rows, ≤ 4 KB per line,
  field lengths capped (ids/names 200, agent/region 100), reserved concurrency 5.
- Secrets (`DATABASE_URL`) only in SAM parameters / Vercel env; `.env.example` holds names only.
- Treat CSV content as untrusted: never `eval`, never render it as HTML (escape everything shown in the UI).

## Testing

- `core`: fixture tests on all 5 sample files — exact counts (4,320 / 5,760 / 6,720 / 10,080 / 14,400 checks,
  0 rejected) and issue counts from README "Data findings".
- Stress: `stress_small`, `stress_chaos` (0 rejected, 276 × 4xx, 3 agents, 4 regions), `stress_large` (463,637 rows, no crash).
  Recreate the files with the `/generate-stress` command (`.claude/commands/generate-stress.md`).
- Incident fixture: all 8 windows in `data/samples/dataset_incident_log.json` detected.
- API: route tests for 201 / 200-duplicate / 400 / 413 / 422, date single vs range filters, cursor paging.
- UI: smoke test per screen state (loading / empty / error / data).
- A bug fix starts with a failing test.

## Automated checks

Enabled automatically by `npm install` (the root `prepare` script runs `git config core.hooksPath .githooks`). Code lives in `scripts/checks/`.

| When | Check | Blocks |
|---|---|---|
| **pre-commit** (staged files) | forbidden files · rule checks · JSON validity · Markdown links · `npm run lint / typecheck / test:unit` (when defined) | .env, secrets, generated stress CSVs, files > 5 MB, broken links, architecture/security violations |
| **commit-msg** | `area: what changed` — areas: core, api, db, web, infra, docs, data, test, chore, checks, deps, fix | wrong format, capital start, trailing period, > 72 chars |
| **pre-push** | `npm run test` · `npm run build` (when defined) · `npm audit --audit-level=high` | failing tests/build, high vulnerabilities |
| **Claude Code** PreToolUse | `claude-guard.js` | `--no-verify`, changing `core.hooksPath`, editing `data/samples/` or `.env` |
| **Claude Code** PostToolUse | `rules.js --hook` on every edited file | same rule checks as pre-commit, reported back immediately |

**Rule checks** (`scripts/checks/rules.js`): secrets · `packages/core` purity · `fetch` outside `apps/web/src/api` ·
raw hex colours outside `tokens.css` · `innerHTML` · string-built SQL · `Math.max(...arr)` · `eval` · `.only` in tests.
A line may opt out with a `// rules-ignore: <reason>` comment; the reason is reviewed.

Never bypass the checks; fix the cause, or change the rule in this file in the same commit.

## Git

- Small commits, one logical change each; commit as you go (reviewers read history).
- Message: `area: what changed` — e.g. `core: merge duplicate reports, failure wins`.
- Never commit secrets, `.env`, `node_modules`, build output or the generated `data/stress/*.csv` files (keep the generator).
- `main` always deployable; README "last verified live" updated after each deploy.

## Documentation

- Behaviour change → update the matching `.claude/*` doc and README in the same commit.
- README is for reviewers: short, factual, numbers from real runs only.
