// Service list (DESIGN.md → Service list): worst first, searched on the server, loaded SVC_PAGE at a time as
// it scrolls, and sized to whole rows only (never a half-cut row).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ServiceRow } from '@sla/core';
import { useServices } from '../../api/hooks';
import { Icon } from '../../components/Icon';
import { ErrorBox, Pill, Skeleton } from '../../components/ui';
import { SEARCH_DEBOUNCE_MS, SVC_PAGE } from '../../lib/constants';
import { allowanceText, fmtPct, nf } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';

export function ServiceList({ uploadId, selectedId, onSelect, fitHeight, stacked }: {
  uploadId: string; selectedId: string | undefined; onSelect: (s: ServiceRow) => void; fitHeight: number; stacked: boolean;
}) {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), SEARCH_DEBOUNCE_MS);
  const res = useServices(uploadId, q);
  const items = res.data?.pages.flatMap(p => p.items);
  const total = res.data?.pages[0]?.total;
  const box = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>();

  // Nothing selected yet: the worst service.
  useEffect(() => {
    if (!selectedId && !q && items?.[0]) onSelect(items[0]);
  }, [selectedId, q, items, onSelect]);

  // Load the next page when the end of the list scrolls into view. Re-observed after each page, so it keeps
  // filling until the box is full; reads the query through a ref so it is not re-attached on every render.
  const latest = useRef(res);
  latest.current = res;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(es => {
      const r = latest.current;
      if (es.some(e => e.isIntersecting) && r.hasNextPage && !r.isFetchingNextPage) void r.fetchNextPage();
    }, { root: box.current, rootMargin: '0px 0px 80px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [items?.length]);

  // Height = search bar + a whole number of rows (phones: at most 5 rows).
  useLayoutEffect(() => {
    const el = box.current;
    const search = el?.querySelector<HTMLElement>('.hsearch');
    const row = el?.querySelector<HTMLElement>('.hitem:not(.hskel)');
    // Not laid out yet (or hidden): nothing to measure, so no fixed height.
    if (!el || !search || !row || row.offsetHeight === 0) return setHeight(undefined);
    const n = stacked ? Math.min(5, items?.length ?? 1) : Math.max(1, Math.floor((fitHeight - search.offsetHeight) / row.offsetHeight));
    setHeight(search.offsetHeight + n * row.offsetHeight);
    // Rows snap below the sticky search bar, never under it (no half-hidden row).
    el.style.scrollPaddingTop = `${search.offsetHeight}px`;
  }, [fitHeight, stacked, items?.length]);

  return (
    <div className="hlist" ref={box} role="group" aria-label="Services, worst availability first" style={{ height }}>
      <label className="hsearch">
        <Icon name="search" size={14} className="hs-icon" />
        <input type="search" className="input" value={text} onChange={e => setText(e.target.value)}
          placeholder="Search services" aria-label="Search services" autoComplete="off" />
        <span className="hs-state" aria-live="polite">{text.trim() !== q || (res.isFetching && !res.isFetchingNextPage) ? (text ? 'Searching…' : 'Loading…') : ''}</span>
      </label>
      {res.isError && <div className="hnone"><ErrorBox error={res.error} onRetry={() => res.refetch()} /></div>}
      {items?.map(s => (
        <button key={s.id} type="button" className="hitem" aria-pressed={s.id === selectedId} onClick={() => onSelect(s)}>
          <span className="n" title={s.name}>{s.name}</span>
          <span className="a num">{fmtPct(s.availability)}</span>
          <span className="s"><Pill met={s.met} /><span className={`num${s.met === false ? ' over' : ''}`}>{allowanceText(s.met, s.timesAllowance)}</span></span>
        </button>
      ))}
      {(res.isPending || res.isFetchingNextPage) && Array.from({ length: items?.length ? 2 : SVC_PAGE }, (_, i) => (
        <div key={i} className="hitem hskel"><Skeleton width="60%" /><Skeleton width={48} /><span className="sk-row"><Skeleton width="40%" /></span></div>
      ))}
      <div ref={sentinel} className="hsent">
        {items && total !== undefined && (
          total === 0 ? <div className="hnone">No service matches.</div>
            : !res.hasNextPage ? <div className="hfoot">{q ? `${nf(total)} match${total === 1 ? '' : 'es'}` : `All ${nf(total)} loaded`}</div>
              : <div className="hfoot">{nf(items.length)} of {nf(total)} · scroll for more</div>
        )}
      </div>
    </div>
  );
}
