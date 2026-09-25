# Design — SLA Watch

> **How it should look and feel.** The reference implementation is the approved mockup:
> **https://claude.ai/artifact/Eusqy1vCS2BjZQnZqZWHC2** (real data from all sample + stress files).
> When this document and the mockup disagree, this document wins; update both together.

---

## Style

**Calm, dense, professional monitoring tool.** White canvas, one level of panels, thin divider lines,
numbers first. Colour is reserved for meaning (red = failed/missed, green = met, amber = partial data,
blue = selection/links). No decoration.

**Three layout laws**
1. **One fixed frame:** sidebar + top bar. Content scrolls inside it.
2. **One level of panels.** Inside a panel, sections are split by **lines, never by another box**.
3. **Nothing floats and nothing is half cut:** charts fit their box; lists show whole rows.

## Typography

| Role | Font | Size / weight |
|---|---|---|
| UI text | **Geist** (Google Fonts), fallback `system-ui, -apple-system, "Segoe UI", sans-serif` | 14px / 400 |
| Numbers, times, file names, IDs | **Geist Mono**, fallback `ui-monospace, Consolas` | 12–12.5px |
| Page title (top bar) | Geist | 19px / 600 |
| KPI value (stat strip) | Geist | 20px / 600, tabular numbers |
| Chart-header availability | Geist | 24px / 600 |
| Uppercase labels | Geist | **11px min** / 500, letter-spacing .07em |
| Minimum for any other text | — | **12px** |

All numbers in tables and KPIs use `font-variant-numeric: tabular-nums`.

## Colors

Defined once as CSS variables (`tokens.css`); components use tokens only — never raw hex.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--surface` | `#ffffff` | `#11161f` | page, panels (all-white canvas) |
| `--surface-2` | `#f7f8fa` | `#161c27` | table headers, filter bar, hover |
| `--track` | `#eceef2` | `#1b2230` | empty hexagons, timeline track, bar tracks |
| `--ink` | `#0f1522` | `#eceff5` | primary text |
| `--ink-2` | `#4b5566` | `#a9b1c0` | secondary text |
| `--muted` | `#667085` | `#8e98a8` | labels, axes, hints (≥ 4.5:1) |
| `--line` / `--line-strong` | `#e3e6eb` / `#cdd2da` | `#212938` / `#2e3848` | dividers, borders |
| `--accent` / `-soft` / `-ink` | `#3654d6` / `#e8ecfc` / `#2a44b4` | `#7089ff` / `#1a2240` / `#9fb0ff` | selection, links, focus |
| `--crit` / `-ink` / `-soft` | `#d03b3b` / `#b42f2f` / `#fbeaea` | `#e25555` / `#f08a8a` / `#2a1719` | failure, Missed, over allowance |
| `--good` / `-ink` / `-soft` | `#0ca30c` / `#0a6e0a` / `#e7f6e7` | same / `#3fc43f` / `#12241a` | Met, success |
| amber text | `#a15c00` | — | coverage < 100% |
| `--heat1` / `--heat2` | `#f3b3b3` / `#e37777` | `#4d2428` / `#8f3a3c` | hex scale: 1 and 2 failures (3+ = `--crit`) |

Dark mode follows `prefers-color-scheme`, overridable with `data-theme="dark|light"` on `<html>`.

---

## Layout (app shell)

```
┌──────────────┬──────────────────────────────────────────────────────────────┐
│ SLA Watch    │ TOP BAR: 6 Apr 2025 – 5 May 2025          [Data report]      │
│              │ monitoring_checks_30d.csv · 30 days · 5 services · 15 min     │
│ ▣ Dashboard  ├──────────────────────────────────────────────────────────────┤
│ ⤒ Uploads    │ ┌ STATS ▼ ───────── Whole upload · SLA 99.9% [⬡ Hex|┃┃ Tl|⚠ Inc 2] ┐
│              │ │ Missed SLA │ Allowed dt │ Incidents │ Lowest av. │ Checks │   │
│ RECENT  View │ │────────────┴────────────┴───────────┴────────────┴────────│   │
│ uploads  all │ │ 🔍 Search   │ reports-api · availability   DOWNTIME│INC│…   │   │
│ 6 Apr–5 May  │ │ service 1   │ 97.15% [Missed · credit]                  ⤢ │   │
│ 3 Apr–23 Apr │ │ service 2   │  hex map (rows = days, cols = hours)  │per day │   │
│ …            │ │ …           │  per-hour bars                               │   │
│              │ │             │  ‹ 6–13 Apr › · legend · 82 of 2,880 failed  │   │
│              │ └──────────────────────────────────────────────────────────┘   │
│              │ ┌ LOGS · UTC ─────────── [All|Failed|Changed]   [⚲ Filters 1] ┐ │
│ footer note  │ │ Filtered by: reports-api ✕                                  │ │
│              │ │ Time │ Service │ Status │ Latency │ Agent │ Region │ Cleaning │ │
│              │ │ Page 1 of 1,440 · 14,400 checks          [Previous][Next]  │ │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

- **Sidebar** 252px, full height, fixed. Brand, nav (Dashboard / Uploads), **Recent uploads** (6 newest +
  current pinned) with a **View all** link to the Uploads table.
- **Top bar** sticky: title (date range) + subline (file · days · services · interval) + **Data report**.
- **Content** max width fluid, 28px side padding, 20px gap between panels.
- Brief compliance: **Stats panel collapses**; **Logs panel below**.

## Screens

| Screen | Content |
|---|---|
| **Dashboard** | Stats panel (stat strip + view area) and Logs panel |
| **Uploads** | Upload panel (drop zone left, "What the file needs" + examples right) → processing steps → result (success / partial / failure) in **one panel**; **All uploads** table (search, 10 per page, Missed-SLA column) |
| **Empty state** | "No monitoring data yet" + Go to Uploads |
| **Data report** (dialog) | Where the rows went (stacked bar) · detected facts · fixes with bars · rejected rows · calculation rules |
| **Full view** (dialog) | Whole hex chart fitted to screen, service tabs, same KPIs |

---

## Components

| Component | Spec |
|---|---|
| **Panel** | white, 1px `--line`, radius 12px; header 54px (46px for Stats) with title left, controls right |
| **Stat strip** | 5 equal cells split by lines: label (caps) · value (20px) · description (12px); ⓘ top-right opens explanation |
| **Chart header** | left: `service · availability` over **97.15%** + pill; right: 4 KPIs (Downtime · Incidents · p50/p95 · Coverage) split by lines, label over value, extras as chips; icon-only ⤢ Full view |
| **Pill** | `Met` (green soft) / `Missed` / `Missed · credit` (red soft), dot + text; never colour alone |
| **Chip** | 11px, radius 99, grey (`max 2 h 15 min`) or red (`28×`) |
| **View toggle** | segmented `[⬡ Hex map | ┃┃ Timeline | ⚠ Incidents ②]` in the Stats header; red count badge |
| **Tabs (logs)** | segmented with counts: All 14,400 · Failed 182 · Changed by cleaning 4,149 |
| **Filters** | one button with count badge → dropdown panel: Date (single/range + All/Last day/Last 7 days), Service, Agent, Region, Sort, Reset/Done; active filters as removable chips under the header |
| **Service list** | search (server-side, debounced) + rows (name, availability, pill, × allowance); **whole rows only**, snap scrolling, infinite scroll in pages of 5 with shimmer rows; footer "10 of 30 · scroll for more" |
| **Tables** | grey header row (11px caps), 13px rows, failed rows tinted red with a 3px red left bar, monospace times |
| **Buttons** | 34px, radius 8; primary = ink background; ghost = white + border; icon buttons 32px with `aria-label` |
| **Info pop-up** | dark bubble, formula in monospace using the upload's real numbers |

## Charts

### Hex map (default view)
- **One layout for every upload:** rows = days, columns = 24 hours (UTC); 1 hexagon = 1 hour (4 checks).
- **Fit to box:** hexagon size from width (max ≈ 34px across); days **paged** to fit the measured height
  (`‹ 6 Apr – 13 Apr · days 1–8 of 30 ›`); phones: 7 days per page.
- Colour scale: 0 = `--track`, 1 = `--heat1`, 2 = `--heat2`, 3+ = `--crit`; **every failed hexagon has a red
  outline** (≥ 3:1); **incident hexagons a thicker dark outline**; legend in the chart footer.
- Right: failures **per day** bars; bottom: failures **per time of day** bars (peak labelled).
- Hover/focus → tooltip; click/Enter → opens that hour's checks in Logs. Keyboard: arrows, Home/End, Enter.
- **Full view** dialog shows every day fitted to the screen.

### Timeline
- One row per service, **binned** (240 bins/row): light tick = 1 failure, solid = 3+; incident bands outlined.
- 10 services per page, worst first. Columns: Service (p95) · Timeline · Availability · SLA · Downtime.

### Incidents view
- Table: Service · Window (UTC) · Duration · Failed checks · Latency during (× normal); sticky header,
  scrolls inside its box; row click → Logs filtered to that window.

---

## UX states (every data view must have all four)

| State | Pattern |
|---|---|
| **Loading** | top progress bar (upload switch), shimmer skeleton rows (logs, service list), "Loading…/Searching…" inside the search box |
| **Empty** | plain sentence + next action ("No incidents in this period. Any failures were single, scattered checks.") |
| **Error** | red alert box: what went wrong + how to fix it; nothing saved |
| **Partial** | amber `!` result: "Processed with 8 rejected rows" + rejected-rows table |

## Motion

- Durations 120–350ms, easing `cubic-bezier(.2,.7,.2,1)`.
- Page fade-up, animated Stats collapse, pop-in for dialogs/menus/chips, fade-in for new chart/table content,
  hover colour transitions, press offset 1px.
- **Never animate content that may start hidden** (it can get stuck invisible).
- `prefers-reduced-motion: reduce` → all animation off.

## Accessibility (WCAG 2.2 AA)

- Text ≥ 4.5:1 (grey `--muted` 4.97:1); graphics ≥ 3:1 (failed-hex outline 4.14:1).
- Every button has an accessible name; every input a label; landmarks `nav`, `main`, `aside`.
- Hex chart: one focusable element, arrow-key navigation, live-region announcements.
- Stat explanations open on click/tap (not hover-only).
- Status never by colour alone (pill text, outlines, legend).

## Responsive

| Width | Behaviour |
|---|---|
| ≥ 1180px | full layout, 5-cell stat strip |
| 920–1180px | chart header may wrap to two lines |
| ≤ 920px | sidebar becomes a top row (uploads scroll sideways); service list stacks above chart (≤ 5 rows, content height) |
| ≤ 760px | stat strip 2 columns, descriptions wrap |
| ≤ 560px | chart: 7 days per page, slim per-day column, no bar labels |

## UX writing

- Plain words, short sentences, user's vocabulary ("checks", "failed", "credit"), active voice.
- Numbers always with units (`43.2 min`, `654 / 845 ms`, `99.69%`).
- Errors say what happened and what to do; no apologies, no jargon.
