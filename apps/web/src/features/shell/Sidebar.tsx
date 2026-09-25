import type { UploadSummary } from '@sla/core';
import { BrandMark, Icon } from '../../components/Icon';
import { Skeleton } from '../../components/ui';
import { SIDE_RECENT } from '../../lib/constants';
import { fmtDay, nf } from '../../lib/format';
import { hrefFor, navigate, type Route, type Screen } from '../../lib/router';

/** Plain links that navigate without a reload (and still open in a new tab with Ctrl/⌘-click). */
function NavLink({ to, className, current, children }: { to: Route; className?: string; current?: 'page' | 'true'; children: React.ReactNode }) {
  return (
    <a href={hrefFor(to)} className={className} aria-current={current}
      onClick={e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}>
      {children}
    </a>
  );
}

function UploadItem({ u, current }: { u: UploadSummary; current: boolean }) {
  const end = new Date(u.rangeEnd);
  return (
    <NavLink to={{ screen: 'dashboard', upload: u.id }} className="sup" current={current ? 'true' : undefined}>
      <b>{fmtDay(u.rangeStart)} – {fmtDay(u.rangeEnd)} {end.getUTCFullYear()}</b>
      <span>{u.days} days · {nf(u.rowsStored)} checks{u.rowsRejected ? ` · ${nf(u.rowsRejected)} rejected` : ''}</span>
    </NavLink>
  );
}

export function Sidebar({ screen, recent, current }: { screen: Screen; recent: UploadSummary[] | undefined; current: UploadSummary | undefined }) {
  const pinned = current && recent && !recent.some(u => u.id === current.id) ? current : undefined;
  return (
    <aside className="side" aria-label="Navigation">
      <div className="brand"><BrandMark />SLA Watch</div>
      <nav className="snav" aria-label="Main">
        <NavLink to={{ screen: 'dashboard', upload: current?.id }} current={screen === 'dashboard' ? 'page' : undefined}>
          <Icon name="dashboard" />Dashboard
        </NavLink>
        <NavLink to={{ screen: 'uploads', upload: current?.id }} current={screen === 'uploads' ? 'page' : undefined}>
          <Icon name="upload" />Uploads
        </NavLink>
      </nav>
      <div className="side-ups">
        <div className="side-label">
          <span>Recent uploads</span>
          <NavLink to={{ screen: 'uploads', upload: current?.id }} className="side-all">View all</NavLink>
        </div>
        <div className="suploads">
          {!recent && Array.from({ length: 3 }, (_, i) => <div key={i} className="sup"><Skeleton width="70%" /><Skeleton width="50%" /></div>)}
          {recent?.length === 0 && <div className="side-empty">Nothing uploaded yet.</div>}
          {recent?.slice(0, SIDE_RECENT).map(u => <UploadItem key={u.id} u={u} current={u.id === current?.id} />)}
          {pinned && <><div className="sup-sep">Viewing</div><UploadItem u={pinned} current /></>}
        </div>
      </div>
      <div className="side-foot">Times are UTC. Each upload is kept separately and never mixed with another.</div>
    </aside>
  );
}
