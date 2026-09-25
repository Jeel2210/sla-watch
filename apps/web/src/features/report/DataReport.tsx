// Data report (DESIGN.md → Screens): where every uploaded row went, what was detected, every fix, rejected rows,
// and how the numbers are calculated — so a reviewer can trust (and check) the dashboard.
import { SLA_TARGET, type UploadDetail } from '@sla/core';
import { useUpload } from '../../api/hooks';
import { Dialog } from '../../components/Dialog';
import { ErrorBox, Skeleton } from '../../components/ui';
import { fixList } from '../../lib/cleaning';
import { fmtStamp, nf, plural } from '../../lib/format';
import { FixBars } from '../uploads/UploadResult';
import './report.css';

const pct = (n: number, of: number) => (of ? `${((100 * n) / of).toFixed(1)}%` : '0%');

function RowsFlow({ u }: { u: UploadDetail }) {
  const flow = [
    { label: 'Stored as uploaded', note: 'Needed no change', n: u.rowsStored - u.rowsFixed, tone: 'good' },
    { label: 'Stored after a fix', note: 'Timestamp, unit, latency or status corrected', n: u.rowsFixed, tone: 'accent' },
    { label: 'Merged as duplicates', note: 'Same check reported again', n: u.rowsMerged, tone: 'muted' },
    { label: 'Rejected', note: 'Could not be read', n: u.rowsRejected, tone: 'crit' },
  ];
  return (
    <section>
      <h3>Where the {nf(u.rowsTotal)} uploaded rows went</h3>
      <div className="flow-total"><span><b>{nf(u.rowsTotal)}</b> rows uploaded</span><span><b>{nf(u.rowsStored)}</b> checks stored</span></div>
      <div className="flow" role="img" aria-label={flow.map(f => `${f.label} ${nf(f.n)}`).join(', ')}>
        {flow.filter(f => f.n > 0).map(f => <span key={f.label} className={`f-${f.tone}`} style={{ flex: f.n }} title={`${f.label}: ${nf(f.n)}`} />)}
      </div>
      <div className="flow-legend">
        {flow.map(f => (
          <div key={f.label}><i className={`f-${f.tone}`} /><span>{f.label}</span><b className="num">{nf(f.n)}</b><small>{f.note} · {pct(f.n, u.rowsTotal)}</small></div>
        ))}
      </div>
    </section>
  );
}

function Detected({ u }: { u: UploadDetail }) {
  const gaps = u.expectedChecks - u.rowsStored;
  const more = u.services - u.serviceNames.length;
  const end = new Date(Date.parse(u.rangeEnd) + u.intervalMin * 60_000).toISOString();
  return (
    <section>
      <h3>Detected from this file</h3>
      <dl className="kv">
        <dt>Period</dt><dd className="num">{fmtStamp(u.rangeStart)} → {fmtStamp(end)} UTC ({plural(u.days, 'day')})</dd>
        <dt>Check interval</dt>
        <dd className="num">
          {u.intervalMin} min{u.intervalHits !== null && u.totalGaps ? ` · ${nf(u.intervalHits)} of ${nf(u.totalGaps)} gaps (${pct(u.intervalHits, u.totalGaps)})` : ''}
        </dd>
        <dt>Services</dt><dd>{u.services}: {u.serviceNames.join(', ')}{more > 0 ? ` and ${more} more` : ''}</dd>
        <dt>Regions</dt><dd>{u.regions.length ? u.regions.join(', ') : <span className="muted">none in the file</span>}</dd>
        <dt>Agents</dt><dd>{u.agents.join(', ')}</dd>
        <dt>Coverage</dt>
        <dd className="num">{nf(u.rowsStored)} of {nf(u.expectedChecks)} expected checks. {gaps ? <><b>{nf(gaps)} missing</b>, shown as no data, not downtime.</> : 'Nothing missing.'}</dd>
      </dl>
    </section>
  );
}

function Body({ u }: { u: UploadDetail }) {
  const fixes = fixList(u.issues);
  return (
    <div className="dlg-body">
      <RowsFlow u={u} />
      <Detected u={u} />
      <section><h3>Fixes applied</h3>{fixes.length ? <FixBars fixes={fixes} /> : <p className="muted">None: every row was already clean.</p>}</section>
      {u.rowsRejected > 0 && (
        <section>
          <h3>Rejected rows</h3>
          <div className="fixes">
            {u.rejectedSample.map(r => <div className="fix" key={r.line}><span>Line {r.line}</span><small>{r.reason}</small></div>)}
          </div>
          {u.rowsRejected > u.rejectedSample.length && <p className="muted">and {nf(u.rowsRejected - u.rejectedSample.length)} more</p>}
        </section>
      )}
      <section>
        <h3>How the numbers are calculated</h3>
        <ul className="rules">
          <li><b>Failed check:</b> status 500–599. 4xx responses count as up: the service answered.</li>
          <li><b>Availability:</b> (valid checks − failed checks) ÷ valid checks, per service, over the whole upload. Invalid codes (outside 100–599) are left out.</li>
          <li><b>Downtime:</b> failed checks × {u.intervalMin} min, the detected check interval.</li>
          <li><b>SLA:</b> missed when availability is below {SLA_TARGET}%; the customer is then eligible for a billing credit.</li>
          <li><b>Incident:</b> failures at most 1 hour apart with at least 2 in a row. For on-call; it does not change the SLA.</li>
          <li><b>Missing checks:</b> no data, never downtime; shown as coverage below 100%.</li>
        </ul>
      </section>
    </div>
  );
}

/** The report's own sections in shimmer while it loads. */
function ReportSkeleton() {
  return (
    <div className="dlg-body" aria-busy="true">
      <section><Skeleton width={220} height={13} /><Skeleton height={14} /><div className="flow-legend">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} width="80%" />)}</div></section>
      <section><Skeleton width={170} height={13} />{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} width={`${90 - i * 8}%`} />)}</section>
      <section><Skeleton width={120} height={13} />{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} />)}</section>
    </div>
  );
}

export function DataReport({ uploadId, open, onClose }: { uploadId: string; open: boolean; onClose: () => void }) {
  const res = useUpload(open ? uploadId : undefined);
  return (
    <Dialog open={open} onClose={onClose} title="Data report for this upload">
      {res.data ? <Body u={res.data} />
        : res.isError ? <div className="dlg-body"><ErrorBox error={res.error} onRetry={() => res.refetch()} /></div>
          : <ReportSkeleton />}
    </Dialog>
  );
}
