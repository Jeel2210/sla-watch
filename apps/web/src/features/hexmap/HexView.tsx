// Hex map view: service list on the left, the selected service's chart on the right (DESIGN.md → Hex map).
import { useLayoutEffect, useRef, useState } from 'react';
import type { ServiceRow } from '@sla/core';
import { usePrefetchHex, useHex } from '../../api/hooks';
import { Icon } from '../../components/Icon';
import { ErrorBox, Skeleton } from '../../components/ui';
import { fmtDay, nf } from '../../lib/format';
import { useElementSize, useViewportHeight } from '../../lib/hooks';
import type { OpenLogs } from '../dashboard/logsWindow';
import { HexChart, HexLegend, cellWindow } from './HexChart';
import { daysPerPage, hexGeometry } from './hexGeometry';
import { ServiceHeader } from './ServiceHeader';
import { ServiceList } from './ServiceList';
import './hexmap.css';

const STACK_BELOW = 920;

function HexMain({ uploadId, s, intervalMin, onOpenLogs, onFullView }: {
  uploadId: string; s: ServiceRow; intervalMin: number; onOpenLogs: OpenLogs; onFullView?: (s: ServiceRow) => void;
}) {
  const [setBox, box] = useElementSize<HTMLDivElement>();
  const mapTop = useRef<HTMLDivElement>(null);
  const viewport = useViewportHeight();
  const [chartTop, setChartTop] = useState(300);
  useLayoutEffect(() => {
    if (mapTop.current) setChartTop(mapTop.current.getBoundingClientRect().top + window.scrollY);
  }, [box.width]);

  const width = Math.max(320, box.width);
  // Height left for the chart when the page is at the top: the whole chart is visible without scrolling.
  const perPage = daysPerPage(width, Math.max(220, viewport - chartTop - 44 - 24));
  const [page, setPage] = useState(0);
  const first = useHex(uploadId, s.id, 0, perPage);
  const totalDays = first.data?.totalDays ?? 0;
  const pages = Math.max(1, Math.ceil(totalDays / perPage));
  const p = Math.min(page, pages - 1);
  const from = pages > 1 ? Math.min(p * perPage, totalDays - perPage) : 0;
  const hex = useHex(uploadId, s.id, from, perPage);
  const prefetch = usePrefetchHex();
  const data = hex.data ?? first.data;
  const g = data ? hexGeometry(data.days, width) : null;

  const go = (next: number) => {
    setPage(next);
    const ahead = Math.min((next + 1) * perPage, Math.max(0, totalDays - perPage));
    if (next + 1 < pages) void prefetch(uploadId, s.id, ahead, perPage);
  };

  return (
    <div className="hmain" ref={setBox}>
      <ServiceHeader s={s} intervalMin={intervalMin} actions={onFullView && (
        <button type="button" className="hm-expand" title="Full view" aria-label="Open the chart in full view" onClick={() => onFullView(s)}>
          <Icon name="expand" size={15} />
        </button>
      )} />
      <div ref={mapTop} />
      {hex.isError ? <ErrorBox error={hex.error} onRetry={() => hex.refetch()} /> : g && data ? (
        <HexChart g={g} serviceName={s.name} className={hex.isPlaceholderData ? 'stale' : ''}
          onOpen={c => onOpenLogs({ service: s.id, serviceName: s.name, ...cellWindow(c), label: `${s.name} · ${cellWindow(c).label}` })} />
      ) : <div className="hm-skel"><Skeleton width="100%" /><Skeleton width="92%" /><Skeleton width="96%" /></div>}
      <div className="hm-foot">
        {pages > 1 && data ? (
          <div className="hpager">
            <button type="button" className="btn small" aria-label="Earlier days" disabled={p === 0} onClick={() => go(p - 1)}>‹</button>
            <span className="num"><b>{fmtDay(`${data.days[0]?.day}T00:00:00Z`)} – {fmtDay(`${data.days[data.days.length - 1]?.day}T00:00:00Z`)}</b> · days {from + 1}–{from + data.days.length} of {totalDays}</span>
            <button type="button" className="btn small" aria-label="Later days" disabled={p >= pages - 1} onClick={() => go(p + 1)}>›</button>
          </div>
        ) : <span />}
        <HexLegend />
        <span className="muted num">{nf(s.failed)} of {nf(s.valid)} checks failed</span>
      </div>
    </div>
  );
}

export function HexView({ uploadId, intervalMin, selected, onSelect, onOpenLogs, onFullView }: {
  uploadId: string; intervalMin: number; selected: ServiceRow | undefined; onSelect: (s: ServiceRow) => void;
  onOpenLogs: OpenLogs; onFullView?: (s: ServiceRow) => void;
}) {
  const [setMain, main] = useElementSize<HTMLDivElement>();
  const stacked = window.innerWidth <= STACK_BELOW;
  return (
    <div className="hexview">
      <ServiceList uploadId={uploadId} selectedId={selected?.id} onSelect={onSelect} fitHeight={main.height} stacked={stacked} />
      <div ref={setMain} className="hmain-wrap">
        {selected ? <HexMain key={selected.id} uploadId={uploadId} s={selected} intervalMin={intervalMin} onOpenLogs={onOpenLogs} onFullView={onFullView} />
          : <div className="hmain"><Skeleton width={220} /><Skeleton width="100%" /><Skeleton width="80%" /></div>}
      </div>
    </div>
  );
}
