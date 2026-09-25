// Incidents view (DESIGN.md → Incidents view): sustained failures in time order; a row opens its checks.
import { useIncidents } from '../../api/hooks';
import { InfoPopover } from '../../components/InfoPopover';
import { ErrorBox, Skeleton } from '../../components/ui';
import { fmtMin, fmtMs, fmtTime, fmtWhen, nf } from '../../lib/format';
import type { OpenLogs } from '../dashboard/logsWindow';
import './incidents.css';

export function IncidentsView({ uploadId, onOpenLogs }: { uploadId: string; onOpenLogs: OpenLogs }) {
  const res = useIncidents(uploadId);
  const items = res.data?.pages.flatMap(p => p.items);
  return (
    <div className="incview">
      <div className="psec-head">
        <h3>Incidents <InfoPopover label="What counts as an incident" title="Incidents"><span>Sustained failures, for on-call. Single scattered failures are not incidents, and incidents do not change the SLA numbers.</span><span className="calc">{`failures ≤ 1 h apart → one group
group counts if ≥ 2 in a row failed
latency during = median ÷ normal`}</span></InfoPopover></h3>
        <span className="hint">Click a row to open its checks in the logs</span>
      </div>
      {res.isError && <div className="pad"><ErrorBox error={res.error} onRetry={() => res.refetch()} /></div>}
      {items?.length === 0 && <div className="iempty">No incidents in this upload. Any failures were single, scattered checks.</div>}
      {(!items || items.length > 0) && !res.isError && (
        <div className="inc-list" role="table" aria-label="Incidents">
          <div className="irow ihead" role="row">
            <span role="columnheader">Service</span><span role="columnheader">Window (UTC)</span>
            <span role="columnheader" className="r">Duration</span><span role="columnheader" className="r">Failed checks</span>
            <span role="columnheader" className="r">Latency during</span>
          </div>
          {!items && Array.from({ length: 3 }, (_, i) => <div key={i} className="irow"><Skeleton width={90} /><Skeleton width={180} /><Skeleton width={50} /><Skeleton width={30} /><Skeleton width={120} /></div>)}
          {items?.map(i => {
            const ratio = i.medianLatencyMs !== null && i.normalLatencyMs ? i.medianLatencyMs / i.normalLatencyMs : null;
            return (
              <button key={`${i.serviceId}-${i.start}`} type="button" className="irow" role="row"
                onClick={() => onOpenLogs({ service: i.serviceId, serviceName: i.serviceName, from: i.start, to: i.end, label: `${i.serviceName} incident · ${fmtWhen(i.start)} → ${fmtTime(i.end)}` })}>
                <span className="sv" role="cell">{i.serviceName}</span>
                <span className="w" role="cell">{fmtWhen(i.start)} → {fmtTime(i.end)}</span>
                <span className="du r num" role="cell">{fmtMin(i.durationMin)}</span>
                <span className="fc r num" role="cell">{nf(i.failed)}</span>
                <span className="la r num" role="cell">{fmtMs(i.medianLatencyMs)} · {ratio !== null && ratio >= 1.5 ? <b>{ratio.toFixed(1)}× normal</b> : 'normal'}</span>
              </button>
            );
          })}
          {res.hasNextPage && (
            <div className="imore"><button type="button" className="btn small" disabled={res.isFetchingNextPage} onClick={() => res.fetchNextPage()}>
              {res.isFetchingNextPage ? 'Loading…' : 'Show more incidents'}
            </button></div>
          )}
        </div>
      )}
    </div>
  );
}
