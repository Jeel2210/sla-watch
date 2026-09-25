// Hex map layout (DESIGN.md → Hex map), ported from the approved mockup. Pure: data + width in, shapes out.
// One layout for every upload: rows = UTC days, columns = the 24 hours; 1 hexagon = 1 hour.
import { HEX_MAX_DAYS, type HexDay } from '@sla/core';
import { fmtDay } from '../../lib/format';

const COLS = 24;
const TOP = 24;
const BOTTOM = 56;
const MIN_R = 6;
const MAX_R = 17;

export interface HexFrame { r: number; narrow: boolean; left: number; sideW: number }

/** Radius from the width: hexagons fill the width, within readable limits. */
export function hexFrame(width: number, maxR = MAX_R): HexFrame {
  const narrow = width < 560;
  const left = narrow ? 44 : 58;
  const sideW = narrow ? 60 : 150;
  const r = Math.max(MIN_R, Math.min((width - left - sideW - 20) / (COLS * 1.5 + 0.5), maxR));
  return { r, narrow, left, sideW };
}

/** Days per page so the chart fits the height it has (phones: a week; never more than one request may ask for). */
export function daysPerPage(width: number, height: number): number {
  const f = hexFrame(width);
  if (f.narrow) return 7;
  const rowH = Math.sqrt(3) * f.r;
  return Math.min(HEX_MAX_DAYS, Math.max(4, Math.floor((height - TOP - BOTTOM) / rowH - 0.5)));
}

/** Largest radius that fits width × height (Full view: every day on one screen). */
export function fitRadius(width: number, height: number, rows: number): number {
  const f = hexFrame(width, 40);
  const byHeight = (height - TOP - BOTTOM) / ((rows + 0.5) * Math.sqrt(3));
  return Math.max(4, Math.min(f.r, byHeight));
}

export interface HexCell {
  key: string;
  day: string;          // YYYY-MM-DD
  hour: number;         // 0–23
  col: number;
  row: number;
  path: string;
  failed: number;
  checks: number;
  incident: boolean;
  heat: 0 | 1 | 2 | 3;  // 0, 1, 2, 3+ failures
}

export interface HexGeometry {
  width: number;
  height: number;
  r: number;
  cells: HexCell[];
  rowLabels: { y: number; text: string }[];
  colLabels: { x: number; text: string }[];
  dayBars: { x: number; y: number; w: number; h: number; n: number }[];
  hourBars: { x: number; y: number; w: number; h: number; n: number; peak: boolean }[];
  sideX: number;
  hourTitleY: number;
  /** Bar titles; short on phones, where the side column is only 60px. */
  dayTitle: string;
  hourTitle: string;
  showValues: boolean;
}

/** Flat-top hexagon path centred on (cx, cy). */
export function hexPath(cx: number, cy: number, r: number): string {
  let d = '';
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k;
    d += `${k ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  }
  return `${d}Z`;
}

export function hexGeometry(days: HexDay[], width: number, radius?: number): HexGeometry {
  const frame = hexFrame(width);
  const r = radius ?? frame.r;
  const { left, narrow } = frame;
  const cw = 1.5 * r;
  const rh = Math.sqrt(3) * r;
  const cx = (c: number) => left + r + c * cw;
  const cy = (c: number, row: number) => TOP + rh / 2 + row * rh + (c % 2 ? rh / 2 : 0);
  const mapW = left + (COLS * 1.5 + 0.5) * r;
  const mapH = TOP + (days.length + 0.5) * rh;

  const cells: HexCell[] = [];
  const perDay = days.map(() => 0);
  const perHour = new Array<number>(COLS).fill(0);
  days.forEach((d, row) => {
    d.hours.forEach((h, col) => {
      perDay[row]! += h.failed;
      perHour[col]! += h.failed;
      cells.push({
        key: `${d.day}-${col}`, day: d.day, hour: col, col, row,
        path: hexPath(cx(col), cy(col, row), r * 0.94),
        failed: h.failed, checks: h.checks, incident: h.incident,
        heat: (h.failed >= 3 ? 3 : h.failed) as HexCell['heat'],
      });
    });
  });

  const rowStep = Math.max(1, Math.ceil(15 / rh));
  const rowLabels = days
    .map((d, row) => ({ y: TOP + rh * 0.75 + row * rh + 4, text: fmtDay(`${d.day}T00:00:00Z`), row }))
    .filter(l => l.row % rowStep === 0)
    .map(({ y, text }) => ({ y, text }));
  const colStep = Math.max(1, Math.ceil(40 / cw));
  const colLabels = Array.from({ length: COLS }, (_, c) => c)
    .filter(c => c % colStep === 0)
    .map(c => ({ x: cx(c), text: `${String(c).padStart(2, '0')}:00` }));

  const sideX = mapW + 18;
  const barMax = Math.max(40, Math.min(width - sideX - 44, 320));
  let maxDay = 1;
  for (const n of perDay) if (n > maxDay) maxDay = n;
  let maxHour = 1;
  for (const n of perHour) if (n > maxHour) maxHour = n;
  const dayBars = perDay.map((n, row) => {
    const h = Math.max(3, Math.min(rh * 0.55, 12));
    const y = TOP + rh * 0.75 + row * rh - h / 2;
    return { x: sideX, y, w: n ? Math.max(3, (n / maxDay) * barMax) : 3, h, n };
  });
  const colY = mapH + 16;
  const colH = 24;
  const hourBars = perHour.map((n, c) => {
    const h = n ? Math.max(3, (n / maxHour) * colH) : 3;
    return { x: cx(c) - r * 0.55, y: colY + colH - h, w: r * 1.1, h, n, peak: n > 0 && n === maxHour };
  });

  return {
    width, height: mapH + BOTTOM, r, cells, rowLabels, colLabels, dayBars, hourBars,
    sideX, hourTitleY: colY + colH, dayTitle: narrow ? 'Day' : 'Per day', hourTitle: narrow ? 'Hour' : 'Per time of day', showValues: !narrow,
  };
}
