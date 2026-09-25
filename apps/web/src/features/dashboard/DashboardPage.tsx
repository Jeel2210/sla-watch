import type { UploadSummary } from '@sla/core';
import { Panel } from '../../components/ui';

/** Phase 1 frame: the Stats and Logs panels arrive in phases 3 and 4. */
export function DashboardPage({ uploadId, upload }: { uploadId: string | undefined; upload: UploadSummary | undefined }) {
  return (
    <>
      <Panel title="Stats" compact><p className="placeholder">Stats for {upload?.fileName ?? uploadId}.</p></Panel>
      <Panel title="Logs"><p className="placeholder">Logs for this upload.</p></Panel>
    </>
  );
}
