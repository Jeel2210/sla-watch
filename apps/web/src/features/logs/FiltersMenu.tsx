// Filters behind one button (DESIGN.md → Filters): date (single / range / quick dates), service, agent,
// region, sort. Changes apply at once; Done or Escape closes, focus returns to the button.
import { useEffect, useRef, useState } from 'react';
import { AGENT_MULTI, type LogSort, type UploadDetail, type UploadSummary } from '@sla/core';
import { useServiceOptions } from '../../api/hooks';
import { Icon } from '../../components/Icon';
import { Segmented } from '../../components/ui';
import { applyPreset, bounds, presetOf, setDates, SORT_LABEL, type LogFilters, type Preset } from './logsFilter';

export function FiltersMenu({ upload, detail, filters, onChange, activeCount }: {
  upload: UploadSummary; detail: UploadDetail | undefined; filters: LogFilters; onChange: (f: LogFilters) => void; activeCount: number;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const services = useServiceOptions(upload.id, open);
  const { first, last } = bounds(upload);
  const preset = presetOf(filters, upload);
  const f = filters;

  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); btn.current?.focus(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  return (
    <>
      <button ref={btn} type="button" className="btn fbtn" aria-expanded={open} aria-controls="log-filters" onClick={() => setOpen(o => !o)}>
        <Icon name="filter" size={14} />Filters{activeCount > 0 && <span className="fbadge" aria-label={`${activeCount} active`}>{activeCount}</span>}
      </button>
      {open && (
        <div ref={panel} id="log-filters" className="fpanel" role="dialog" aria-label="Log filters">
          <div className="fp-sec">
            <span className="flabel">Date (UTC)</span>
            <div className="fp-row">
              <Segmented label="Date filter" value={f.window ? 'range' : f.mode}
                onChange={mode => onChange(mode === 'single' ? { ...f, window: null, mode, to: f.from } : { ...f, window: null, mode })}
                options={[{ value: 'single', label: 'Single date' }, { value: 'range', label: 'Range' }]} />
              <div className="presets" role="group" aria-label="Quick dates">
                {([['all', 'All'], ['last1', 'Last day'], ['last7', 'Last 7 days']] as [Preset, string][]).map(([p, label]) => (
                  <button key={p} type="button" aria-pressed={preset === p} onClick={() => onChange(applyPreset(f, p, upload))}>{label}</button>
                ))}
              </div>
            </div>
            <div className="fp-row">
              <input type="date" className="input" aria-label={f.mode === 'single' ? 'Date' : 'From date'} min={first} max={last}
                value={f.window ? f.window.from.slice(0, 10) : f.from}
                onChange={e => onChange(setDates(f, e.target.value, f.mode === 'single' ? e.target.value : f.to, upload))} />
              {f.mode === 'range' && <>
                <span className="dash">to</span>
                <input type="date" className="input" aria-label="To date" min={first} max={last}
                  value={f.window ? f.window.to.slice(0, 10) : f.to}
                  onChange={e => onChange(setDates(f, f.from, e.target.value, upload))} />
              </>}
            </div>
            {f.window && <p className="fp-note">Showing a window from the chart: {f.window.label}. Pick a date to replace it.</p>}
          </div>
          <div className="fp-grid">
            <div>
              <label className="flabel" htmlFor="f-service">Service</label>
              <select id="f-service" className="select" value={f.window ? f.window.service : f.service}
                onChange={e => onChange({ ...f, window: null, service: e.target.value })}>
                <option value="">All services</option>
                {services.isPending && <option disabled>Loading…</option>}
                {services.data?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="flabel" htmlFor="f-agent">Agent</label>
              <select id="f-agent" className="select" value={f.agent} onChange={e => onChange({ ...f, agent: e.target.value })}>
                <option value="">All agents</option>
                {detail?.agents.map(a => <option key={a} value={a}>{a}</option>)}
                {(detail?.agents.length ?? 0) > 1 && <option value={AGENT_MULTI}>Reported by 2+ agents</option>}
              </select>
            </div>
            <div>
              <label className="flabel" htmlFor="f-region">Region</label>
              <select id="f-region" className="select" value={f.region} onChange={e => onChange({ ...f, region: e.target.value })}>
                <option value="">All regions</option>
                {detail?.regions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="flabel" htmlFor="f-sort">Sort</label>
              <select id="f-sort" className="select" value={f.sort} onChange={e => onChange({ ...f, sort: e.target.value as LogSort })}>
                {(Object.keys(SORT_LABEL) as LogSort[]).map(s => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
              </select>
            </div>
          </div>
          <div className="fp-foot">
            <button type="button" className="btn" onClick={() => onChange({ ...applyPreset(f, 'all', upload), service: '', agent: '', region: '', sort: 'fail' })}>Reset</button>
            <button type="button" className="btn primary" onClick={() => { setOpen(false); btn.current?.focus(); }}>Done</button>
          </div>
        </div>
      )}
    </>
  );
}
