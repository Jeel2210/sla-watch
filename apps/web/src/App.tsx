import { useState } from 'react';
import { Icon } from './components/Icon';
import { TopProgress } from './components/TopProgress';
import { EmptyState, ErrorBox, Panel } from './components/ui';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { DataReport } from './features/report/DataReport';
import { Sidebar } from './features/shell/Sidebar';
import { TopBar, UploadTopBar } from './features/shell/TopBar';
import { useCurrentUpload } from './features/shell/useCurrentUpload';
import { UploadsPage } from './features/uploads/UploadsPage';
import { navigate, useRoute } from './lib/router';

export default function App() {
  const route = useRoute();
  const current = useCurrentUpload();
  const [report, setReport] = useState(false);

  return (
    <div className="app">
      <Sidebar screen={route.screen} recent={current.recent} current={current.upload} />
      <main className="main">
        <TopProgress />
        {route.screen === 'uploads' ? (
          <>
            <TopBar title="Uploads" sub="Add a monitoring CSV. The cleaning function checks and cleans every row, then saves it as a new upload." />
            <div className="content fade-up" key="uploads"><UploadsPage currentId={current.id} /></div>
          </>
        ) : current.empty ? (
          <>
            <TopBar title="Dashboard" sub="No uploads yet" />
            <div className="content fade-up">
              <Panel>
                <EmptyState title="No monitoring data yet"
                  action={<button type="button" className="btn primary" onClick={() => navigate({ screen: 'uploads' })}>Go to Uploads</button>}>
                  Upload a CSV of health checks. Once it’s cleaned and saved, this page shows availability, SLA status, incidents and every check.
                </EmptyState>
              </Panel>
            </div>
          </>
        ) : current.error && !current.upload ? (
          <>
            <TopBar title="Dashboard" sub="" />
            <div className="content">
              <ErrorBox title="This upload could not be loaded" error={current.error} />
              <div><button type="button" className="btn" onClick={() => navigate({ screen: 'dashboard' })}>Open the latest upload</button></div>
            </div>
          </>
        ) : (
          <>
            <UploadTopBar upload={current.upload} actions={current.id && (
              <button type="button" className="btn ghost" onClick={() => setReport(true)}><Icon name="report" size={14} />Data report</button>
            )} />
            {current.id && <DataReport uploadId={current.id} open={report} onClose={() => setReport(false)} />}
            <div className="content fade-up" key={current.id}><DashboardPage uploadId={current.id} upload={current.upload} /></div>
          </>
        )}
      </main>
    </div>
  );
}
