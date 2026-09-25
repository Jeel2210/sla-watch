import type { ReactNode } from 'react';
import type { UploadSummary } from '@sla/core';
import { Skeleton } from '../../components/ui';
import { fmtRange, plural } from '../../lib/format';

export function TopBar({ title, sub, actions }: { title: ReactNode; sub: ReactNode; actions?: ReactNode }) {
  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        <div className="sub">{sub}</div>
      </div>
      {actions && <div className="tb-right">{actions}</div>}
    </header>
  );
}

/** Dashboard header: the upload's period, then file · days · services · interval (all detected, never assumed). */
export function UploadTopBar({ upload, actions }: { upload: UploadSummary | undefined; actions?: ReactNode }) {
  if (!upload) return <TopBar title={<Skeleton width={260} />} sub={<Skeleton width={360} />} />;
  return (
    <TopBar
      title={fmtRange(upload.rangeStart, upload.rangeEnd)}
      sub={<>
        <span className="file">{upload.fileName}</span><i>·</i>
        <span>{plural(upload.days, 'day')}</span><i>·</i>
        <span>{plural(upload.services, 'service')}</span><i>·</i>
        <span>a check every {upload.intervalMin} min</span>
      </>}
      actions={actions}
    />
  );
}
