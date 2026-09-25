// The hex map SVG (DESIGN.md → Hex map). One focusable element: arrows move between hexagons,
// Enter opens that hour's checks, a live region reads the focused hexagon (a11y).
import { useState } from 'react';
import { HoverTip, useHoverTip } from '../../components/HoverTip';
import { InfoPopover } from '../../components/InfoPopover';
import { fmtDay, nf } from '../../lib/format';
import type { HexCell, HexGeometry } from './hexGeometry';

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
export const cellWindow = (c: HexCell) => ({
  from: `${c.day}T${hh(c.hour)}:00.000Z`,
  to: new Date(Date.parse(`${c.day}T${hh(c.hour)}:00.000Z`) + 3_600_000).toISOString(),
  label: `${fmtDay(`${c.day}T00:00:00Z`)}, ${hh(c.hour)}–${hh((c.hour + 1) % 24)}`,
});

function describe(c: HexCell, serviceName: string): string {
  const { label } = cellWindow(c);
  const what = c.checks === 0 ? 'no data' : c.failed ? `${c.failed} of ${c.checks} checks failed` : 'all checks passed';
  return `${serviceName}, ${label} UTC: ${what}${c.incident ? ', part of an incident' : ''}`;
}

/** Width of an uppercase 11px title in the SVG (letter-spaced), to place its help icon right after it. */
const titleWidth = (t: string) => t.length * 7.3;

/** "5 Jan = 1 + 4 + 4 + 4 + 3 + 4 + 2 = 22": the busiest row and column on screen, as worked examples. */
function sums(g: HexGeometry) {
  let row = 0;
  g.dayBars.forEach((b, i) => { if (b.n > (g.dayBars[row]?.n ?? 0)) row = i; });
  let col = 0;
  g.hourBars.forEach((b, i) => { if (b.n > (g.hourBars[col]?.n ?? 0)) col = i; });
  const rowCells = g.cells.filter(c => c.row === row && c.failed > 0);
  const colCells = g.cells.filter(c => c.col === col && c.failed > 0);
  const day = g.cells.find(c => c.row === row)?.day;
  return {
    perDay: rowCells.length && day ? `${fmtDay(`${day}T00:00:00Z`)} = ${rowCells.map(c => c.failed).join(' + ')} = ${g.dayBars[row]?.n}` : 'no failed checks on these days',
    perHour: colCells.length ? `${hh(col)} = ${colCells.map(c => `${c.failed} (${fmtDay(`${c.day}T00:00:00Z`)})`).join(' + ')} = ${g.hourBars[col]?.n}` : 'no failed checks on these days',
  };
}

export function HexChart({ g, serviceName, intervalMin, onOpen, className = '' }: {
  g: HexGeometry; serviceName: string; intervalMin: number; onOpen: (c: HexCell) => void; className?: string;
}) {
  const ex = sums(g);
  const { tip, show, hide } = useHoverTip();
  const [focus, setFocus] = useState(-1);
  const current = g.cells[focus];

  const move = (dCol: number, dRow: number) => {
    const from = current ?? g.cells[0];
    if (!from) return;
    const i = g.cells.findIndex(c => c.col === from.col + dCol && c.row === from.row + dRow);
    if (i >= 0) setFocus(i);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowRight: () => move(1, 0), ArrowLeft: () => move(-1, 0), ArrowDown: () => move(0, 1), ArrowUp: () => move(0, -1),
      Home: () => setFocus(0), End: () => setFocus(g.cells.length - 1),
      Enter: () => current && onOpen(current), ' ': () => current && onOpen(current),
    };
    const run = keys[e.key];
    if (!run) return;
    e.preventDefault();
    if (focus < 0 && e.key !== 'Enter' && e.key !== ' ') { setFocus(0); return; }
    run();
  };

  return (
    <div className={`hm-map fade-in ${className}`}>
      <svg className="hexsvg" width={g.width} height={g.height} viewBox={`0 0 ${g.width} ${g.height}`} tabIndex={0}
        role="img" aria-label={`${serviceName}: failed checks per hour. Use the arrow keys to move between hours and Enter to open their checks.`}
        onKeyDown={onKey} onFocus={() => focus < 0 && setFocus(0)} onMouseLeave={hide}>
        {g.cells.map((c, i) => (
          <path key={c.key} d={c.path}
            className={`hx h${c.heat}${c.failed ? ' f' : ''}${c.incident ? ' inc' : ''}${c.checks === 0 ? ' nodata' : ''}${i === focus ? ' kf' : ''}`}
            onClick={() => onOpen(c)}
            onMouseMove={e => show(e, <>
              <b>{serviceName}</b><br />{cellWindow(c).label} UTC<br />
              {c.checks === 0 ? 'No data' : c.failed ? <><b>{c.failed} of {c.checks}</b> checks failed</> : 'All checks passed'}
              {c.incident && <><br />Part of an incident</>}
              {c.checks > 0 && <span className="calc">{`downtime = ${c.failed} × ${intervalMin} min = ${nf(c.failed * intervalMin)} min`}</span>}
              <span className="dim">Click to open these checks</span>
            </>)} />
        ))}
        {g.rowLabels.map(l => <text key={l.y} className="hexaxis" x={0} y={l.y}>{l.text}</text>)}
        {g.colLabels.map(l => <text key={l.x} className="hexaxis" x={l.x} y={12} textAnchor="middle">{l.text}</text>)}
        <text className="mtitle" x={g.sideX} y={12}>{g.dayTitle}</text>
        {g.dayBars.map((b, i) => (
          <g key={i}>
            <rect className={`mbar${b.n ? '' : ' zero'}`} x={b.x} y={b.y} width={b.w} height={b.h} rx={2} />
            {b.n > 0 && g.showValues && <text className="mval" x={b.x + b.w + 5} y={b.y + b.h / 2 + 3.5}>{b.n}</text>}
          </g>
        ))}
        {g.hourBars.map((b, i) => (
          <g key={i}>
            <rect className={`mbar${b.n ? '' : ' zero'}`} x={b.x} y={b.y} width={b.w} height={b.h} rx={1.5} />
            {b.peak && <text className="mval" x={b.x + b.w / 2} y={b.y - 4} textAnchor="middle">{b.n}</text>}
          </g>
        ))}
        <text className="mtitle" x={g.sideX} y={g.hourTitleY}>{g.hourTitle}</text>
      </svg>
      <span className="hm-help" style={{ left: g.sideX + titleWidth(g.dayTitle) + 6, top: 0 }}>
        <InfoPopover label="Per day: how it is calculated" title="Per day">
          <span>Failed checks in one row: the 24 hours of a UTC day, added up. The busiest day shown:</span>
          <span className="calc">{ex.perDay}</span>
        </InfoPopover>
      </span>
      <span className="hm-help" style={{ left: g.sideX + titleWidth(g.hourTitle) + 6, top: g.hourTitleY - 12 }}>
        <InfoPopover label="Per time of day: how it is calculated" title="Per time of day">
          <span>Failed checks in one column: the same hour on every day shown, added up. The busiest hour:</span>
          <span className="calc">{ex.perHour}</span>
        </InfoPopover>
      </span>
      <div className="sr-only" aria-live="polite">{current ? `${describe(current, serviceName)}. Press Enter to open these checks.` : ''}</div>
      <HoverTip tip={tip} />
    </div>
  );
}

/** Legend: 0 / 1 / 2 / 3+ failed checks per hexagon, and the incident outline. */
export function HexLegend({ intervalMin, failed, valid }: { intervalMin: number; failed: number; valid: number }) {
  const swatch = (cls: string) => (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path className={cls} d="M11.8 6L8.9 11.02H3.1L.2 6 3.1.98h5.8z" /></svg>
  );
  return (
    <span className="hexlegend">
      <span>Failed per hour</span>
      <InfoPopover label="Failed per hour: how the hex map is calculated" title="Failed per hour">
        <span>Each hexagon is one hour of one service; rows are days, columns are hours (UTC).</span>
        <span className="calc">{`checks per hour = 60 ÷ ${intervalMin} = ${Math.round(60 / intervalMin)}
colour  = failed that hour: 0 · 1 · 2 · 3+
outline = hour is part of an incident
footer  = ${nf(failed)} of ${nf(valid)} failed, whole upload`}</span>
      </InfoPopover>
      {swatch('hx h0')}0{swatch('hx h1 f')}1{swatch('hx h2 f')}2{swatch('hx h3 f')}3+
      {swatch('hx h0 inc')}incident
    </span>
  );
}
