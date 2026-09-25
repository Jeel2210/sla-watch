import { useCallback, useState } from 'react';
import type { ServiceRow, UploadSummary } from '@sla/core';
import { useUpload } from '../../api/hooks';
import { Panel, Skeleton } from '../../components/ui';
import { defaultFilters, withWindow, type LogFilters } from '../logs/logsFilter';
import { LogsPanel } from '../logs/LogsPanel';
import type { LogsWindow } from './logsWindow';
import { StatsPanel } from './StatsPanel';
import './dashboard.css';

function Dashboard({ upload }: { upload: UploadSummary }) {
  const [selected, setSelected] = useState<ServiceRow | undefined>();
  const [filters, setFilters] = useState<LogFilters>(() => defaultFilters(upload));
  const detail = useUpload(upload.id);
  // A chart click narrows the logs to that window and brings them into view.
  const openLogs = useCallback((w: LogsWindow) => {
    setFilters(f => withWindow(f, w));
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => document.getElementById('logs')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }));
  }, []);

  return (
    <>
      <StatsPanel upload={upload} selected={selected} onSelect={setSelected} onOpenLogs={openLogs} />
      <LogsPanel upload={upload} detail={detail.data} filters={filters} onFilters={setFilters} />
    </>
  );
}

/** One upload: Stats on top, Logs below (brief). App keys this by upload id, so state resets per upload. */
export function DashboardPage({ upload }: { uploadId: string | undefined; upload: UploadSummary | undefined }) {
  if (!upload) return <Panel title="Stats" compact><div className="pad"><Skeleton width="60%" /></div></Panel>;
  return <Dashboard upload={upload} />;
}
