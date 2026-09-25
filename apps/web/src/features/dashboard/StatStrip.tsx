// Stat strip (DESIGN.md → Stat strip): 5 cells split by lines; ⓘ explains each with this upload's numbers.
import type { ReactNode } from 'react';
import type { UploadStats, UploadSummary } from '@sla/core';
import { InfoPopover } from '../../components/InfoPopover';
import { ErrorBox, Skeleton } from '../../components/ui';
import { fmtMin, fmtPct, nf } from '../../lib/format';

function Cell({ label, value, desc, info, tone }: { label: string; value: ReactNode; desc: ReactNode; info: ReactNode; tone?: 'bad' | 'good' }) {
  return (
    <div className="kc">
      <div className="top"><span className="label">{label}</span><InfoPopover label={`${label}: how this is calculated`}>{info}</InfoPopover></div>
      <span className={`v num${tone ? ` ${tone}` : ''}`}>{value}</span>
      <span className="d">{desc}</span>
    </div>
  );
}

export function StatStrip({ stats, upload, error, onRetry }: { stats: UploadStats | undefined; upload: UploadSummary; error: unknown; onRetry: () => void }) {
  if (error) return <div className="kstrip-err"><ErrorBox title="The stats could not be loaded" error={error} onRetry={onRetry} /></div>;
  if (!stats) {
    return <div className="kstrip">{Array.from({ length: 5 }, (_, i) => <div key={i} className="kc"><Skeleton width={90} /><Skeleton width={70} /><Skeleton width={140} /></div>)}</div>;
  }
  const slots = upload.services ? upload.expectedChecks / upload.services : 0;
  const t = stats.slaTarget;
  return (
    <div className="kstrip">
      <Cell label={`Missed ${t}% SLA`} tone={stats.missed ? 'bad' : 'good'}
        value={`${stats.missed} of ${stats.servicesTotal}`}
        desc={stats.missed ? 'services · eligible for a billing credit' : 'all services met the SLA'}
        info={<><b>Services that missed {t}%</b><br />A service misses the SLA when its availability over the uploaded period is below {t}%. The customer is then eligible for a billing credit. Every failed check counts.
          <div className="calc">{stats.missed} of {stats.servicesTotal} services below {t}%</div></>} />
      <Cell label="Allowed downtime" value={fmtMin(stats.allowedDowntimeMin)} desc={`per service at ${t}%`}
        info={<><b>Allowed downtime</b><br />How much downtime {t}% leaves over this upload.
          <div className="calc">{nf(slots)} checks × {upload.intervalMin} min × {(100 - t).toFixed(1)}%<br />= {fmtMin(stats.allowedDowntimeMin)} per service</div></>} />
      <Cell label="Incidents" value={nf(stats.incidents)}
        desc={stats.longestIncident ? `longest ${fmtMin(stats.longestIncident.minutes)} · ${stats.longestIncident.serviceName}` : 'no sustained outages'}
        info={<><b>Incidents</b><br />Sustained failures, for on-call. Failures at most 1 hour apart are grouped, and a group counts when at least 2 checks in a row failed.
          <div className="calc">Incidents do not change the SLA numbers. They show which failures were real outages.</div></>} />
      <Cell label="Lowest availability" value={stats.lowest ? fmtPct(stats.lowest.availability) : '—'} desc={stats.lowest?.serviceName ?? 'no valid checks'}
        info={<><b>Lowest availability</b><br />The service with the lowest availability over the uploaded period.</>} />
      <Cell label="Checks stored" value={nf(upload.rowsStored)} desc={`from ${nf(upload.rowsTotal)} rows · ${nf(upload.rowsRejected)} rejected`}
        info={<><b>Checks stored</b><br />One check per service per {upload.intervalMin}-minute slot, after cleaning. Duplicate reports are merged and unreadable rows are rejected. The data report lists every fix.
          <div className="calc">{nf(upload.rowsTotal)} rows → {nf(upload.rowsStored)} stored<br />{nf(upload.rowsMerged)} merged · {nf(upload.rowsRejected)} rejected</div></>} />
    </div>
  );
}
