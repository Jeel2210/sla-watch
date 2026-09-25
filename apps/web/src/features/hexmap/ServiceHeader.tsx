// Chart header (DESIGN.md → Chart header): the service's availability + SLA, and its four KPIs.
import type { ServiceRow } from '@sla/core';
import { InfoPopover } from '../../components/InfoPopover';
import { Chip, Pill } from '../../components/ui';
import { fmtMin, fmtPct, nf } from '../../lib/format';

function Kpi({ label, tip, children, warn }: { label: string; tip: React.ReactNode; children: React.ReactNode; warn?: boolean }) {
  return (
    <div className="ks">
      <InfoPopover label={`${label}: how it is calculated`} trigger={<span className="kl">{label}</span>}>
        <b>{label}</b><br />{tip}
      </InfoPopover>
      <span className={`kv${warn ? ' warnv' : ''}`}>{children}</span>
    </div>
  );
}

export function ServiceKpis({ s, intervalMin }: { s: ServiceRow; intervalMin: number }) {
  const over = s.met === false;
  const coverage = s.coverage >= 99.995 ? '100' : s.coverage.toFixed(2);
  return (
    <div className="hm-stats num">
      <Kpi label="Downtime" tip={<>Failed checks × {intervalMin} min.<div className="calc">{nf(s.failed)} × {intervalMin} min = {fmtMin(s.downtimeMin)}<br />Allowed at 99.9%: {fmtMin(s.allowedDowntimeMin)}</div></>}>
        {fmtMin(s.downtimeMin)}
        {over && <Chip tone="bad">{s.timesAllowance >= 1.95 ? `${Math.round(s.timesAllowance)}×` : 'over'}</Chip>}
      </Kpi>
      <Kpi label="Incidents" tip="Failures at most 1 hour apart, grouped, with at least 2 in a row. For on-call; they do not change the SLA.">
        {s.incidents}
        {s.longestIncidentMin !== null && <Chip>max {fmtMin(s.longestIncidentMin)}</Chip>}
      </Kpi>
      <Kpi label="p50 / p95" tip="Latency of successful checks with a usable latency.">
        {s.p50Ms === null ? '—' : `${nf(s.p50Ms)} / ${nf(s.p95Ms ?? 0)}`}<small>ms</small>
      </Kpi>
      <Kpi label="Coverage" warn={s.coverage < 99.995}
        tip={<>{nf(s.present)} of {nf(s.expected)} expected checks present. Missing checks count as no data, not downtime.</>}>
        {coverage}%
      </Kpi>
    </div>
  );
}

export function ServiceHeader({ s, intervalMin, actions }: { s: ServiceRow; intervalMin: number; actions?: React.ReactNode }) {
  return (
    <div className="hm-top">
      <div className="hm-name">
        <span className="hn">
          <h3 title={s.name}>{s.name}</h3>
          <span>
            · availability{' '}
            <InfoPopover label="How availability is calculated">
              <b>Availability</b><br />(Valid checks − failed checks) ÷ valid checks. A failed check is status 500–599; invalid codes are left out.
              <div className="calc">({nf(s.valid)} − {nf(s.failed)}) ÷ {nf(s.valid)} = {fmtPct(s.availability)}</div>
            </InfoPopover>
          </span>
        </span>
        <span className="hv"><b className="num">{fmtPct(s.availability)}</b><Pill met={s.met} credit /></span>
      </div>
      <div className="hm-right">
        <ServiceKpis s={s} intervalMin={intervalMin} />
        {actions}
      </div>
    </div>
  );
}
