import { AllUploads } from './AllUploads';
import { UploadPanel } from './UploadPanel';
import './uploads.css';

export function UploadsPage({ currentId }: { currentId: string | undefined }) {
  return (
    <>
      <UploadPanel />
      <AllUploads currentId={currentId} />
    </>
  );
}
