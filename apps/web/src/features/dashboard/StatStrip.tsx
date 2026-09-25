// Stat strip (DESIGN.md → Stat strip): 5 cells split by lines; each help icon shows the formula with this upload's numbers.
import type { ReactNode } from 'react';
import type { UploadStats, UploadSummary } from '@sla/core';
import { InfoPopover } from '../../components/InfoPopover';
import { ErrorBox, Skeleton } from '../../components/ui';
import { fmtMin, fmtPct, nf } from '../../lib/format';

function Cell({ label, value, desc, tip, calc, tone }: {
  label: string; value: ReactNode; desc: ReactNode; tip: ReactNode; calc: ReactNode; tone?: 'bad' | 'good';
}) {
  return (
    <div className="kc">
      <div className="top">
        <span className="label">{label}</span>
        <InfoPopover label={`${label}: how it is calculated`} title={label}>
          <span>{tip}</span><span className="calc">{calc}</span>
        </InfoPopover>
      </div>
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
  const share = `${(100 - t).toFixed(1)}%`;
  return (
    <div className="kstrip">
      <Cell label={`Missed ${t}% SLA`} tone={stats.missed ? 'bad' : 'good'}
        value={`${stats.missed} of ${stats.servicesTotal}`}
        desc={stats.missed ? 'services · eligible for a billing credit' : 'all services met the SLA'}
        tip={`Services whose availability over the whole upload is below ${t}%. Each is eligible for a billing credit.`}
        calc={`availability = (valid − failed) ÷ valid\nmissed if availability < ${t}%\n→ ${stats.missed} of ${stats.servicesTotal} services`} />
      <Cell label="Allowed downtime" value={fmtMin(stats.allowedDowntimeMin)} desc={`per service at ${t}%`}
        tip={`How much downtime ${t}% leaves each service over this upload.`}
        calc={`slots × interval × ${share}\n= ${nf(slots)} × ${upload.intervalMin} min × ${share}\n= ${fmtMin(stats.allowedDowntimeMin)}`} />
      <Cell label="Incidents" value={nf(stats.incidents)}
        desc={stats.longestIncident ? `longest ${fmtMin(stats.longestIncident.minutes)} · ${stats.longestIncident.serviceName}` : 'no sustained outages'}
        tip="Failures at most 1 hour apart, grouped; a group counts when at least 2 checks in a row failed. For on-call; it does not change the SLA."
        calc={`incidents across ${stats.servicesTotal} services = ${nf(stats.incidents)}`
          + (stats.longestIncident ? `\nlongest = ${fmtMin(stats.longestIncident.minutes)} (${stats.longestIncident.serviceName})` : '')} />
      <Cell label="Lowest availability" value={stats.lowest ? fmtPct(stats.lowest.availability) : '—'} desc={stats.lowest?.serviceName ?? 'no valid checks'}
        tip="The service with the lowest availability over the whole upload. Its own help icon in the chart shows the calculation."
        calc={stats.lowest ? `min over ${stats.servicesTotal} services\n= ${fmtPct(stats.lowest.availability)} (${stats.lowest.serviceName})` : 'no service has valid checks'} />
      <Cell label="Checks stored" value={nf(upload.rowsStored)} desc={`from ${nf(upload.rowsTotal)} rows · ${nf(upload.rowsRejected)} rejected`}
        tip={`One check per service per ${upload.intervalMin}-minute slot, after cleaning. Duplicate reports are merged; unreadable rows are rejected. The data report lists every fix.`}
        calc={`rows uploaded − merged − rejected\n= ${nf(upload.rowsTotal)} − ${nf(upload.rowsMerged)} − ${nf(upload.rowsRejected)}\n= ${nf(upload.rowsStored)} checks`} />
    </div>
  );
}
