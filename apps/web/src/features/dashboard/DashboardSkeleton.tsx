// First load, before the upload is known: the dashboard's own shape in shimmer (DESIGN.md → UX states: Loading),
// so nothing jumps when the data arrives.
import { Skeleton } from '../../components/ui';
import { LOG_PAGE, SVC_PAGE } from '../../lib/constants';

export function DashboardSkeleton() {
  return (
    <div className="dash-skel" aria-busy="true" aria-label="Loading the dashboard">
      <section className="pnl">
        <div className="pnl-head compact"><Skeleton width={70} /><Skeleton width={320} /></div>
        <div className="kstrip">
          {Array.from({ length: 5 }, (_, i) => <div key={i} className="kc"><Skeleton width={90} /><Skeleton width={70} height={16} /><Skeleton width={140} /></div>)}
        </div>
        <div className="hexview">
          <div className="hlist">
            <div className="hsearch"><Skeleton height={32} /></div>
            {Array.from({ length: SVC_PAGE }, (_, i) => (
              <div key={i} className="hitem hskel"><Skeleton width="60%" /><Skeleton width={48} /><span className="sk-row"><Skeleton width="40%" /></span></div>
            ))}
          </div>
          <div className="hmain-wrap">
            <div className="hmain">
              <div className="hm-top"><div className="hm-name"><Skeleton width={120} /><Skeleton width={160} height={22} /></div><Skeleton width={360} height={30} /></div>
              <div className="hm-skel"><Skeleton /><Skeleton width="92%" /><Skeleton width="96%" /><Skeleton width="88%" /><Skeleton width="94%" /></div>
            </div>
          </div>
        </div>
      </section>
      <section className="pnl">
        <div className="pnl-head"><Skeleton width={110} /><Skeleton width={320} height={28} /></div>
        <div className="tbl">
          <table>
            <tbody>
              {Array.from({ length: LOG_PAGE }, (_, i) => (
                <tr key={i}>{[120, 90, 40, 56, 70, 60, 60].map((w, j) => <td key={j}><Skeleton width={w} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
