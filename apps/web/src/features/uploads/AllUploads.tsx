// All uploads (DESIGN.md → Uploads): searched on the server, 10 per page, newest first.
import { useState } from 'react';
import { useUploadsPage } from '../../api/hooks';
import { ErrorBox, Panel, Skeleton } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { SEARCH_DEBOUNCE_MS, UPLOAD_PAGE } from '../../lib/constants';
import { fmtDayYear, nf } from '../../lib/format';
import { useCursorPager, useDebounced } from '../../lib/hooks';
import { hrefFor, navigate } from '../../lib/router';

export function AllUploads({ currentId }: { currentId: string | undefined }) {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), SEARCH_DEBOUNCE_MS);
  const pager = useCursorPager(q);
  const res = useUploadsPage({ q: q || undefined, cursor: pager.cursor, limit: UPLOAD_PAGE });
  const items = res.data?.items;
  const open = (id: string) => navigate({ screen: 'dashboard', upload: id });

  return (
    <Panel id="all-uploads" headingId="all-uploads-title" title={<h2 id="all-uploads-title">All uploads</h2>}
      actions={
        <label className="search">
          <Icon name="search" size={14} />
          <input type="search" className="input" value={text} onChange={e => setText(e.target.value)}
            placeholder="Search by file name" aria-label="Search uploads" />
        </label>
      }>
      {res.isError ? <div className="pad"><ErrorBox error={res.error} onRetry={() => res.refetch()} /></div> : (
        <div className={`tbl${res.isPlaceholderData ? ' stale' : ''}`}>
          <table className="rows-link">
            <thead><tr><th>File</th><th>Period (UTC)</th><th className="r">Days</th><th className="r">Checks</th><th className="r">Rejected</th><th className="r">Missed SLA</th></tr></thead>
            <tbody>
              {!items && Array.from({ length: 4 }, (_, i) => (
                <tr key={i}>{[220, 170, 30, 60, 30, 70].map((w, j) => <td key={j}><Skeleton width={w} /></td>)}</tr>
              ))}
              {items?.length === 0 && (
                <tr><td colSpan={6} className="none">{q ? `No uploads match “${q}”.` : 'Nothing uploaded yet.'}</td></tr>
              )}
              {items?.map(u => (
                <tr key={u.id} className={u.id === currentId ? 'cur' : ''} onClick={() => open(u.id)}>
                  <td className="m">
                    <a href={hrefFor({ screen: 'dashboard', upload: u.id })} onClick={e => { e.preventDefault(); e.stopPropagation(); open(u.id); }}>{u.fileName}</a>
                    {u.id === currentId && <span className="vtag">Viewing</span>}
                  </td>
                  <td>{fmtDayYear(u.rangeStart)} → {fmtDayYear(u.rangeEnd)}</td>
                  <td className="r num">{u.days}</td>
                  <td className="r num">{nf(u.rowsStored)}</td>
                  <td className={`r num${u.rowsRejected ? ' bad' : ''}`}>{nf(u.rowsRejected)}</td>
                  <td className="r num"><span className={`pill ${u.missedSla ? 'missed' : 'met'}`}><span className="dot" />{u.missedSla} of {u.services}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pager">
        <span className="num">{items ? (items.length ? `Page ${pager.page + 1}${q ? ' · matching' : ''}` : '') : <Skeleton inline width={60} />}</span>
        <div>
          <button type="button" className="btn" disabled={pager.page === 0} onClick={pager.prev}>Previous</button>
          <button type="button" className="btn" disabled={!res.data?.nextCursor || res.isPlaceholderData}
            onClick={() => res.data?.nextCursor && pager.next(res.data.nextCursor)}>Next</button>
        </div>
      </div>
    </Panel>
  );
}
