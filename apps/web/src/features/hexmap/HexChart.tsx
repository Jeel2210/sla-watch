// The hex map SVG (DESIGN.md → Hex map). One focusable element: arrows move between hexagons,
// Enter opens that hour's checks, a live region reads the focused hexagon (a11y).
import { useState } from 'react';
import { HoverTip, useHoverTip } from '../../components/HoverTip';
import { fmtDay } from '../../lib/format';
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

export function HexChart({ g, serviceName, onOpen, className = '' }: {
  g: HexGeometry; serviceName: string; onOpen: (c: HexCell) => void; className?: string;
}) {
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
              <br /><span className="dim">Click to open these checks</span>
            </>)} />
        ))}
        {g.rowLabels.map(l => <text key={l.y} className="hexaxis" x={0} y={l.y}>{l.text}</text>)}
        {g.colLabels.map(l => <text key={l.x} className="hexaxis" x={l.x} y={12} textAnchor="middle">{l.text}</text>)}
        <text className="mtitle" x={g.sideX} y={12}>Per day</text>
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
        <text className="mtitle" x={g.sideX} y={g.hourTitleY}>Per time of day</text>
      </svg>
      <div className="sr-only" aria-live="polite">{current ? `${describe(current, serviceName)}. Press Enter to open these checks.` : ''}</div>
      <HoverTip tip={tip} />
    </div>
  );
}

/** Legend: 0 / 1 / 2 / 3+ failed checks per hexagon, and the incident outline. */
export function HexLegend() {
  const swatch = (cls: string) => (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path className={cls} d="M11.8 6L8.9 11.02H3.1L.2 6 3.1.98h5.8z" /></svg>
  );
  return (
    <span className="hexlegend">
      <span>Failed per hour</span>
      {swatch('hx h0')}0{swatch('hx h1 f')}1{swatch('hx h2 f')}2{swatch('hx h3 f')}3+
      {swatch('hx h0 inc')}incident
    </span>
  );
}
