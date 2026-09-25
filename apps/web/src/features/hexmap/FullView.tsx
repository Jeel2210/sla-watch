// Full view (DESIGN.md → Full view): the whole hex chart fitted to the screen, with service tabs and the same KPIs.
import { useState } from 'react';
import type { ServiceRow } from '@sla/core';
import { useHexAll, useServices } from '../../api/hooks';
import { Dialog } from '../../components/Dialog';
import { ErrorBox, Pill, Skeleton } from '../../components/ui';
import { fmtPct } from '../../lib/format';
import { useElementSize } from '../../lib/hooks';
import type { OpenLogs } from '../dashboard/logsWindow';
import { HexChart, cellWindow } from './HexChart';
import { fitRadius, hexGeometry } from './hexGeometry';
import { ServiceKpis } from './ServiceHeader';

function Chart({ uploadId, s, intervalMin, onOpenLogs }: { uploadId: string; s: ServiceRow; intervalMin: number; onOpenLogs: OpenLogs }) {
  const [setBody, size] = useElementSize<HTMLDivElement>();
  const days = useHexAll(uploadId, s.id, true);
  const width = Math.max(360, size.width - 8);
  const g = days.data ? hexGeometry(days.data, width, fitRadius(width, Math.max(260, size.height - 8), days.data.length)) : null;
  return (
    <div className="hf-body" ref={setBody}>
      {days.isError ? <ErrorBox error={days.error} onRetry={() => days.refetch()} />
        : g ? <HexChart g={g} serviceName={s.name} intervalMin={intervalMin}
          onOpen={c => onOpenLogs({ service: s.id, serviceName: s.name, ...cellWindow(c), label: `${s.name} · ${cellWindow(c).label}` })} />
          : <div className="hm-skel wide"><Skeleton /><Skeleton width="90%" /><Skeleton width="95%" /></div>}
    </div>
  );
}

export function FullView({ uploadId, intervalMin, initial, onClose, onOpenLogs }: {
  uploadId: string; intervalMin: number; initial: ServiceRow | null; onClose: () => void; onOpenLogs: OpenLogs;
}) {
  const [picked, setPicked] = useState<ServiceRow | null>(null);
  const s = picked ?? initial;
  const services = useServices(uploadId, '');
  const tabs = services.data?.pages.flatMap(p => p.items) ?? [];
  const close = () => { setPicked(null); onClose(); };

  return (
    <Dialog open={!!initial} onClose={close} className="hexfull"
      title={<><h2>Failed checks per hour</h2><span className="muted">Whole upload · rows are days, columns are hours (UTC)</span></>}>
      {s && (
        <>
          <div className="hf-bar">
            <div className="tabs hf-tabs" role="group" aria-label="Service">
              {services.isPending && Array.from({ length: 4 }, (_, i) => <button key={i} type="button" disabled><Skeleton inline width={90} /></button>)}
              {tabs.map(t => (
                <button key={t.id} type="button" aria-pressed={t.id === s.id} onClick={() => setPicked(t)}>
                  {t.name}<span className="c num">{fmtPct(t.availability)}</span>
                </button>
              ))}
              {services.hasNextPage && <button type="button" onClick={() => services.fetchNextPage()}>More services…</button>}
            </div>
            <div className="hf-stats">
              <div className="hm-av"><b className="num">{fmtPct(s.availability)}</b><Pill met={s.met} credit /></div>
              <ServiceKpis s={s} intervalMin={intervalMin} />
            </div>
          </div>
          <Chart key={s.id} uploadId={uploadId} s={s} intervalMin={intervalMin} onOpenLogs={w => { close(); onOpenLogs(w); }} />
        </>
      )}
    </Dialog>
  );
}
