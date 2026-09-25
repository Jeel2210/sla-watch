// Timeline (DESIGN.md → Timeline): one row per service, worst first; failures per bin (light = 1, solid = 3+),
// incident bands, 10 services per page. The payload size never depends on the upload's size.
import { useState } from 'react';
import type { TimelinePage, TimelineRow, UploadSummary } from '@sla/core';
import { useTimeline } from '../../api/hooks';
import { HoverTip, useHoverTip } from '../../components/HoverTip';
import { InfoPopover } from '../../components/InfoPopover';
import { ErrorBox, Pill, Skeleton } from '../../components/ui';
import { TL_PAGE } from '../../lib/constants';
import { allowanceText, fmtDay, fmtMin, fmtPct, fmtTime, fmtWhen, nf } from '../../lib/format';
import type { OpenLogs } from '../dashboard/logsWindow';
import './timeline.css';

const DAY = 86_400_000;
const W = 1000;

function binWindow(t: TimelinePage, rangeEndMs: number, bin: number) {
  const start = Date.parse(t.rangeStart) + bin * t.binMin * 60_000;
  const end = Math.min(start + t.binMin * 60_000, rangeEndMs);
  return { start, end };
}

function Row({ t, r, days, rangeEndMs, onOpenLogs }: { t: TimelinePage; r: TimelineRow; days: number[]; rangeEndMs: number; onOpenLogs: OpenLogs }) {
  const { tip, show, hide } = useHoverTip();
  const bw = W / t.bins;
  const start = Date.parse(t.rangeStart);
  const span = t.bins * t.binMin * 60_000;
  const X = (ms: number) => ((ms - start) / span) * W;
  const failed = r.failed.reduce((a, b) => a + b, 0);
  const binAt = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return Math.min(t.bins - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * t.bins)));
  };
  const open = (bin: number) => {
    const w = binWindow(t, rangeEndMs, bin);
    onOpenLogs({
      service: r.serviceId, serviceName: r.name, from: new Date(w.start).toISOString(), to: new Date(w.end).toISOString(),
      label: `${r.name} · ${fmtWhen(w.start)}–${fmtTime(w.end)}`,
    });
  };

  return (
    <div className="svc-grid svc-row">
      <div className="svc-name">{r.name}<small className="num">p95 {r.p95Ms === null ? '—' : `${nf(r.p95Ms)} ms`}</small></div>
      <div className="tl">
        <svg viewBox={`0 0 ${W} 30`} preserveAspectRatio="none" role="img"
          aria-label={`${r.name}: ${nf(failed)} failed checks, ${r.incidents.length} incidents`}
          onMouseMove={e => {
            const b = binAt(e);
            const w = binWindow(t, rangeEndMs, b);
            const n = r.failed[b] ?? 0;
            const inc = r.incidents.some(([a, z]) => b >= a && b <= z);
            show(e, <>
              <b>{r.name}</b><br />{fmtWhen(w.start)}–{fmtTime(w.end)} UTC<br />
              {n ? <><b>{n}</b> failed check{n > 1 ? 's' : ''}</> : 'No failures here'}{inc && <><br />Part of an incident</>}
              <br /><span className="dim">Click to open these checks</span>
            </>);
          }}
          onMouseLeave={hide} onClick={e => open(binAt(e))}>
          <rect x={0} y={6} width={W} height={18} className="tl-track" rx={3} />
          {days.map(d => <rect key={d} x={X(d)} y={0} width={0.8} height={30} className="tl-grid" />)}
          {r.incidents.map(([a, z]) => (
            <rect key={a} x={a * bw} y={3} width={Math.max((z - a + 1) * bw, 2.2)} height={24} rx={2} className="tl-band" vectorEffect="non-scaling-stroke" />
          ))}
          {r.failed.map((n, b) => n > 0 && (
            <rect key={b} x={b * bw} y={6} width={Math.max(bw - 0.6, 1.6)} height={18} rx={0.8} className="tl-tick" fillOpacity={n >= 3 ? 1 : n === 2 ? 0.75 : 0.5} />
          ))}
        </svg>
      </div>
      <div className="avail num">{fmtPct(r.availability)}</div>
      <div className="sla"><Pill met={r.met} /></div>
      <div className="down num"><b>{fmtMin(r.downtimeMin)}</b><span className={r.met === false ? 'over' : ''}>{allowanceText(r.met, r.timesAllowance)}</span></div>
      <HoverTip tip={tip} />
    </div>
  );
}

export function TimelineView({ upload, onOpenLogs }: { upload: UploadSummary; onOpenLogs: OpenLogs }) {
  const [offset, setOffset] = useState(0);
  const res = useTimeline(upload.id, offset);
  const t = res.data;
  const rangeEndMs = Date.parse(upload.rangeEnd) + upload.intervalMin * 60_000;
  const start = Date.parse(upload.rangeStart);
  const days: number[] = [];
  for (let d = Math.ceil(start / DAY) * DAY; d < rangeEndMs; d += DAY) days.push(d);
  const step = Math.max(1, Math.ceil(days.length / 7));
  const span = t ? t.bins * t.binMin * 60_000 : rangeEndMs - start;

  return (
    <div className="svc-list">
      <div className="svc-grid svc-head">
        <span>Service</span>
        <span className="tl-h">Timeline
          <span className="legend"><span><i className="lg-tick light" />1 failed</span><span><i className="lg-tick" />3+ failed</span><span><i className="lg-band" />incident</span></span>
        </span>
        <span className="r">Availability <InfoPopover label="How availability is calculated"><b>Availability</b><br />(Valid checks − failed checks) ÷ valid checks, per service, over the whole upload. A failed check is status 500–599.</InfoPopover></span>
        <span>SLA <InfoPopover label="What Met and Missed mean"><b>SLA</b><br /><b>Met</b>: availability is 99.9% or higher.<br /><b>Missed</b>: below 99.9%, so the customer is eligible for a billing credit.</InfoPopover></span>
        <span className="r">Downtime <InfoPopover label="How downtime is calculated"><b>Downtime</b><br />Failed checks × {upload.intervalMin} min, the interval detected in this file, compared with what 99.9% allows.</InfoPopover></span>
      </div>
      {res.isError && <ErrorBox error={res.error} onRetry={() => res.refetch()} />}
      <div className={res.isPlaceholderData ? 'stale' : ''}>
        {t ? t.items.map(r => <Row key={r.serviceId} t={t} r={r} days={days} rangeEndMs={rangeEndMs} onOpenLogs={onOpenLogs} />)
          : !res.isError && Array.from({ length: 5 }, (_, i) => <div key={i} className="svc-grid svc-row"><Skeleton width={120} /><Skeleton /><Skeleton width={60} /><Skeleton width={50} /><Skeleton width={80} /></div>)}
      </div>
      {t && t.total > TL_PAGE && (
        <div className="hpager tlpager">
          <button type="button" className="btn small" aria-label="Previous services" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - TL_PAGE))}>‹</button>
          <span className="num">Services <b>{offset + 1}–{Math.min(t.total, offset + TL_PAGE)}</b> of {t.total} · worst first</span>
          <button type="button" className="btn small" aria-label="More services" disabled={offset + TL_PAGE >= t.total} onClick={() => setOffset(offset + TL_PAGE)}>›</button>
        </div>
      )}
      <div className="svc-grid axis-row">
        <span className="sp" />
        <div className="axis">
          {days.filter((_, k) => k % step === 0).map(d => <span key={d} style={{ left: `${((d - start) / span) * 100}%` }}>{fmtDay(d)}</span>)}
        </div>
        <span className="sp" /><span className="sp" /><span className="sp" />
      </div>
    </div>
  );
}
