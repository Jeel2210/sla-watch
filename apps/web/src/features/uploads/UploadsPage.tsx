import { Panel } from '../../components/ui';

/** Phase 1 frame: the upload panel and All uploads table arrive in phase 2. */
export function UploadsPage(_: { currentId: string | undefined }) {
  return <Panel title="Upload a CSV"><p className="placeholder">The upload panel arrives in the next phase.</p></Panel>;
}
