// Logs (brief: "logs below, filterable by a single date or a date range"): 10 rows per page from the server,
// cursor paging, tab counts for the current filters, and what cleaning changed on every row.
import { useEffect, useMemo } from 'react';
import type { CheckRow, LogTab, UploadDetail, UploadSummary } from '@sla/core';
import { useChecks, usePrefetchChecks, useServiceOptions } from '../../api/hooks';
import { InfoPopover } from '../../components/InfoPopover';
import { ErrorBox, Segmented, Skeleton } from '../../components/ui';
import { flagTexts } from '../../lib/cleaning';
import { LOG_PAGE } from '../../lib/constants';
import { fmtMs, fmtStamp, nf } from '../../lib/format';
import { useCursorPager } from '../../lib/hooks';
import { FiltersMenu } from './FiltersMenu';
import { chips, toQuery, unset, type LogFilters } from './logsFilter';
import './logs.css';

function Status({ c }: { c: CheckRow }) {
  const cls = !c.isValid ? 'inv' : c.isFailed ? 'bad' : '';
  const word = !c.isValid ? 'invalid code' : c.isFailed ? 'failed' : 'up';
  return <span className={`code ${cls}`}><span className="dot" aria-hidden="true" />{c.status}<span className="sr-only"> ({word})</span></span>;
}

function Changes({ c, detail, intervalMin }: { c: CheckRow; detail: UploadDetail | undefined; intervalMin: number }) {
  if (!c.flags.length) return <span className="muted">—</span>;
  const texts = flagTexts(c, {
    offsets: detail ? Object.keys(detail.issues.offsets) : [],
    units: detail ? Object.keys(detail.issues.unitConverted) : [],
    intervalMin,
  });
  return (
    <span className="chg">
      <InfoPopover label="What cleaning changed" title="What cleaning changed"><ul>{texts.map(t => <li key={t}>{t}</li>)}</ul></InfoPopover>
      {texts.length} change{texts.length > 1 ? 's' : ''}
    </span>
  );
}

export function LogsPanel({ upload, detail, filters, onFilters }: {
  upload: UploadSummary; detail: UploadDetail | undefined; filters: LogFilters; onFilters: (f: LogFilters) => void;
}) {
  const query = useMemo(() => toQuery(filters), [filters]);
  const pager = useCursorPager(JSON.stringify(query));
  const res = useChecks(upload.id, query, pager.cursor, LOG_PAGE);
  // Tab counts come with the first page; later pages reuse it from the cache (no extra request).
  const first = useChecks(upload.id, query, undefined, LOG_PAGE);
  const counts = first.data?.counts ?? null;
  const prefetch = usePrefetchChecks();
  const next = res.data?.nextCursor;
  useEffect(() => { if (next && !res.isPlaceholderData) void prefetch(upload.id, query, next, LOG_PAGE); }, [next, res.isPlaceholderData, upload.id, query]);

  const services = useServiceOptions(upload.id, !!filters.service && !filters.window);
  const names = Object.fromEntries((services.data ?? []).map(s => [s.id, s.name]));
  const active = chips(filters, upload, names);
  const activeFilters = active.filter(c => c.key !== 'sort').length;
  const total = counts?.[filters.tab];
  const pages = total === undefined ? undefined : Math.max(1, Math.ceil(total / LOG_PAGE));
  const rows = res.data?.items;

  return (
    <section className="pnl logs" id="logs" aria-labelledby="logs-title">
      <div className="pnl-head logs-head">
        <h2 id="logs-title">Logs <span className="muted sub">· times in UTC</span></h2>
        <div className="pnl-actions">
          <Segmented<LogTab> label="Show" value={filters.tab} onChange={tab => onFilters({ ...filters, tab })} options={[
            { value: 'all', label: 'All', count: counts ? nf(counts.all) : <Skeleton inline width={34} /> },
            { value: 'failed', label: 'Failed', count: counts ? nf(counts.failed) : <Skeleton inline width={22} /> },
            { value: 'changed', label: 'Changed by cleaning', count: counts ? nf(counts.changed) : <Skeleton inline width={30} /> },
          ]} />
          <FiltersMenu upload={upload} detail={detail} filters={filters} onChange={onFilters} activeCount={activeFilters} />
        </div>
      </div>
      {active.length > 0 && (
        <div className="achips">
          <span className="label">Filtered by</span>
          {active.map(c => (
            <span key={c.key} className={`achip${c.key === 'window' ? ' win' : ''}`}>
              {c.label}<button type="button" aria-label={`Remove ${c.label}`} onClick={() => onFilters(unset(filters, c.key, upload))}>✕</button>
            </span>
          ))}
          {active.length > 1 && <button type="button" className="clear" onClick={() => onFilters(unset(filters, 'all', upload))}>Clear all</button>}
        </div>
      )}
      {res.isError ? <div className="pad"><ErrorBox title="The logs could not be loaded" error={res.error} onRetry={() => res.refetch()} /></div> : (
        <div className={`tbl${res.isPlaceholderData ? ' stale' : ''}`}>
          <table>
            <thead><tr><th>Time</th><th>Service</th><th>Status</th><th className="r">Latency</th><th>Agent</th><th>Region</th><th>Cleaning</th></tr></thead>
            <tbody className={rows ? 'fade-in' : ''} key={`${pager.cursor ?? ''}${JSON.stringify(query)}`}>
              {!rows && Array.from({ length: LOG_PAGE }, (_, i) => (
                <tr key={i}>{[120, 90, 40, 56, 70, 60, 60].map((w, j) => <td key={j}><Skeleton width={w} /></td>)}</tr>
              ))}
              {rows?.length === 0 && <tr><td colSpan={7} className="none">No checks match. Widen the dates or switch to All.</td></tr>}
              {rows?.map(c => (
                <tr key={`${c.slot}|${c.serviceId}`} className={c.isFailed ? 'fail' : ''}>
                  <td className="m">{fmtStamp(c.slot)}</td>
                  <td>{c.serviceName}</td>
                  <td><Status c={c} /></td>
                  <td className="r m">{c.latencyMs === null ? <span className="muted">—</span> : fmtMs(c.latencyMs)}</td>
                  <td className="m">{c.agents.join(', ')}</td>
                  <td className="m">{c.region ?? <span className="muted">—</span>}</td>
                  <td><Changes c={c} detail={detail} intervalMin={upload.intervalMin} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pager">
        <span className="num" aria-live="polite">
          {pages !== undefined && total !== undefined ? `Page ${nf(pager.page + 1)} of ${nf(pages)} · ${nf(total)} checks` : <Skeleton inline width={170} />}
        </span>
        <div>
          <button type="button" className="btn" disabled={pager.page === 0} onClick={pager.prev}>Previous</button>
          <button type="button" className="btn" disabled={!next || res.isPlaceholderData} onClick={() => next && pager.next(next)}>Next</button>
        </div>
      </div>
    </section>
  );
}
