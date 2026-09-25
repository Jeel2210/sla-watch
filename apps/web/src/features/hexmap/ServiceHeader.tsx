// Chart header (DESIGN.md → Chart header): the service's availability + SLA, and its four KPIs.
// Every value with a formula has the same help icon, and the formula uses this service's own numbers.
import type { ServiceRow } from '@sla/core';
import { InfoPopover } from '../../components/InfoPopover';
import { Chip, Pill } from '../../components/ui';
import { fmtMin, fmtPct, nf } from '../../lib/format';

function Kpi({ label, tip, calc, children, warn }: { label: string; tip: string; calc: string; children: React.ReactNode; warn?: boolean }) {
  return (
    <div className="ks">
      <span className="kl-row">
        <span className="kl">{label}</span>
        <InfoPopover label={`${label}: how it is calculated`} title={label}><span>{tip}</span><span className="calc">{calc}</span></InfoPopover>
      </span>
      <span className={`kv${warn ? ' warnv' : ''}`}>{children}</span>
    </div>
  );
}

export function ServiceKpis({ s, intervalMin }: { s: ServiceRow; intervalMin: number }) {
  const over = s.met === false;
  const times = s.timesAllowance >= 1.95 ? `${Math.round(s.timesAllowance)}×` : 'over';
  const coverage = s.coverage >= 99.995 ? '100' : s.coverage.toFixed(2);
  const missing = s.expected - s.present;
  return (
    <div className="hm-stats num">
      <Kpi label="Downtime" tip={`Failed checks × ${intervalMin} min, the interval detected in this file. The chip compares it with what 99.9% allows.`}
        calc={`failed × interval\n= ${nf(s.failed)} × ${intervalMin} min = ${fmtMin(s.downtimeMin)}\nallowed ${fmtMin(s.allowedDowntimeMin)}${over ? ` → ${times} over` : ' → within'}`}>
        {fmtMin(s.downtimeMin)}
        {over && <Chip>{times}</Chip>}
      </Kpi>
      <Kpi label="Incidents" tip="Failures at most 1 hour apart, grouped, with at least 2 in a row. For on-call; they do not change the SLA."
        calc={`${nf(s.incidents)} incident${s.incidents === 1 ? '' : 's'}${s.longestIncidentMin !== null ? ` · longest ${fmtMin(s.longestIncidentMin)}` : ''}`}>
        {s.incidents}
        {s.longestIncidentMin !== null && <Chip>max {fmtMin(s.longestIncidentMin)}</Chip>}
      </Kpi>
      <Kpi label="p50 / p95" tip="Latency of successful checks with a usable latency: half answered within p50, 95% within p95."
        calc={s.p50Ms === null ? 'no successful checks with a latency' : `p50 = ${nf(s.p50Ms)} ms · p95 = ${nf(s.p95Ms ?? 0)} ms`}>
        {s.p50Ms === null ? '—' : `${nf(s.p50Ms)} / ${nf(s.p95Ms ?? 0)}`}<small>ms</small>
      </Kpi>
      <Kpi label="Coverage" warn={s.coverage < 99.995} tip="Checks present ÷ checks expected. Missing checks count as no data, not downtime."
        calc={`present ÷ expected\n= ${nf(s.present)} ÷ ${nf(s.expected)} = ${coverage}%${missing ? `\n${nf(missing)} missing` : ''}`}>
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
            · availability
            <InfoPopover label="How availability is calculated" title="Availability">
              <span>Valid checks that did not fail. A failed check is status 500–599; invalid codes are left out.</span>
              <span className="calc">{`(valid − failed) ÷ valid\n= (${nf(s.valid)} − ${nf(s.failed)}) ÷ ${nf(s.valid)} = ${fmtPct(s.availability)}`}</span>
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
