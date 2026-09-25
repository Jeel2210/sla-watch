// Stats panel (brief: "collapsible stats on top"): stat strip + one of three views, switched in the header.
import { useEffect, useId, useRef, useState } from 'react';
import type { ServiceRow, UploadSummary } from '@sla/core';
import { useStats } from '../../api/hooks';
import { Segmented } from '../../components/ui';
import { useStored } from '../../lib/hooks';
import { HexView } from '../hexmap/HexView';
import { IncidentsView } from '../incidents/IncidentsView';
import { TimelineView } from '../timeline/TimelineView';
import type { OpenLogs } from './logsWindow';
import { StatStrip } from './StatStrip';

const VIEWS = ['hex', 'timeline', 'incidents'] as const;
type View = (typeof VIEWS)[number];

export function StatsPanel({ upload, selected, onSelect, onOpenLogs, onFullView }: {
  upload: UploadSummary; selected: ServiceRow | undefined; onSelect: (s: ServiceRow) => void;
  onOpenLogs: OpenLogs; onFullView?: (s: ServiceRow) => void;
}) {
  const [open, setOpen] = useState(true);
  const [view, setView] = useStored<View>('sla-view', VIEWS, 'hex');
  const stats = useStats(upload.id);
  const bodyId = useId();
  const body = useRef<HTMLDivElement>(null);
  // Collapsed content must not be reachable by keyboard (React 18 has no `inert` prop yet).
  useEffect(() => { if (body.current) body.current.inert = !open; }, [open]);
  const incidents = stats.data?.incidents;

  return (
    <section className={`pnl stats${open ? '' : ' collapsed'}`} aria-label="Stats">
      <div className="pnl-head compact">
        <button type="button" className="toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(o => !o)}>
          <span className="chev" aria-hidden="true">▼</span>Stats
        </button>
        <div className="sh-right">
          <span className="muted sh-scope">Whole upload · SLA target 99.9% per service</span>
          <Segmented variant="toggle" label="Chart view" value={view} onChange={setView} options={[
            { value: 'hex', label: 'Hex map', icon: 'hex' },
            { value: 'timeline', label: 'Timeline', icon: 'timeline' },
            { value: 'incidents', label: 'Incidents', icon: 'incident', badge: incidents ? <span className="ibadge num">{incidents}</span> : undefined },
          ]} />
        </div>
      </div>
      <div className="stats-body" id={bodyId} ref={body} aria-hidden={!open}>
        <div className="sb-inner">
          <StatStrip stats={stats.data} upload={upload} error={stats.error} onRetry={() => stats.refetch()} />
          {view === 'hex' && <HexView uploadId={upload.id} intervalMin={upload.intervalMin} selected={selected} onSelect={onSelect} onOpenLogs={onOpenLogs} onFullView={onFullView} />}
          {view === 'timeline' && <TimelineView upload={upload} onOpenLogs={onOpenLogs} />}
          {view === 'incidents' && <IncidentsView uploadId={upload.id} onOpenLogs={onOpenLogs} />}
        </div>
      </div>
    </section>
  );
}
