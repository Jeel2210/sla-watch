import { useCallback, useState } from 'react';
import type { ServiceRow, UploadSummary } from '@sla/core';
import { Panel } from '../../components/ui';
import type { LogsWindow } from './logsWindow';
import { StatsPanel } from './StatsPanel';
import './dashboard.css';

/** One upload: Stats on top, Logs below (brief). App keys this by upload id, so state resets per upload. */
export function DashboardPage({ upload }: { uploadId: string | undefined; upload: UploadSummary | undefined }) {
  const [selected, setSelected] = useState<ServiceRow | undefined>();
  const [logsWindow, setLogsWindow] = useState<LogsWindow | null>(null);
  const openLogs = useCallback((w: LogsWindow) => {
    setLogsWindow(w);
    document.getElementById('logs')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }, []);

  if (!upload) return <Panel title="Stats" compact><div className="pad" /></Panel>;
  return (
    <>
      <StatsPanel upload={upload} selected={selected} onSelect={setSelected} onOpenLogs={openLogs} />
      <Panel id="logs" title="Logs"><p className="pad">{logsWindow ? `Filtered by: ${logsWindow.label}` : 'Logs for this upload.'}</p></Panel>
    </>
  );
}
