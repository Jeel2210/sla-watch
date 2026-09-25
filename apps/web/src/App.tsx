import React, { useState } from 'react';
import { uploadCsv, getUploads, getHealth } from './api/client';
import { Dashboard } from './features/Dashboard';
import { Logs } from './features/Logs';
import './styles/index.css';

interface UploadSummary {
  id: string;
  fileName: string;
  duplicate: boolean;
  rowsStored: number;
  rowsMerged: number;
  rowsFixed: number;
  rowsRejected: number;
}

interface Upload extends UploadSummary {
  uploadedAt: string;
}

export default function App() {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [lastUpload, setLastUpload] = useState<UploadSummary | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    setStatus('uploading');
    setMessage('Processing your file...');

    try {
      const result = await uploadCsv(file);
      setLastUpload(result);
      setShowDashboard(true);
      setStatus('success');
      setMessage(
        `✓ ${result.duplicate ? 'Duplicate upload' : 'Upload successful'}. Stored ${result.rowsStored} checks.`
      );

      // Refresh uploads list
      const list = await getUploads();
      setUploads(list.uploads || []);
    } catch (error: any) {
      setStatus('error');
      setMessage(`✗ ${error.message}`);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('dragover');
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    setStatus('uploading');
    setMessage('Processing your file...');

    try {
      const result = await uploadCsv(file);
      setLastUpload(result);
      setShowDashboard(true);
      setStatus('success');
      setMessage(
        `✓ ${result.duplicate ? 'Duplicate upload' : 'Upload successful'}. Stored ${result.rowsStored} checks.`
      );

      // Refresh uploads list
      const list = await getUploads();
      setUploads(list.uploads || []);
    } catch (error: any) {
      setStatus('error');
      setMessage(`✗ ${error.message}`);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>SLA Watch</h1>
        <p>Upload a CSV of health-check logs. We'll clean it, compute SLA stats, and show you the dashboard.</p>
      </div>

      <div className="panel">
        <h2>Upload Monitoring CSV</h2>

        {status !== 'idle' && (
          <div className={status === 'success' ? 'success' : status === 'error' ? 'error' : 'loading'}>
            {message}
          </div>
        )}

        <div
          className="upload-zone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            disabled={status === 'uploading'}
          />
          <div>
            <p style={{ marginBottom: '8px', fontWeight: 500 }}>
              Drag CSV file here or click to select
            </p>
            <p style={{ fontSize: '12px', color: 'var(--ink-2)' }}>
              Max 50 MB raw (gzipped in browser). Accepts UTC and epoch timestamps, mixed units, duplicates from multiple
              agents.
            </p>
          </div>
        </div>
      </div>

      {lastUpload && (
        <div className="panel">
          <h2>Upload Summary</h2>
          <table className="table">
            <tbody>
              <tr>
                <td><strong>File</strong></td>
                <td>{lastUpload.fileName}</td>
              </tr>
              <tr>
                <td><strong>ID</strong></td>
                <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{lastUpload.id}</td>
              </tr>
              <tr>
                <td><strong>Checks Stored</strong></td>
                <td>{lastUpload.rowsStored.toLocaleString()}</td>
              </tr>
              <tr>
                <td><strong>Merged</strong></td>
                <td>{lastUpload.rowsMerged}</td>
              </tr>
              <tr>
                <td><strong>Fixed</strong></td>
                <td>{lastUpload.rowsFixed}</td>
              </tr>
              <tr>
                <td><strong>Rejected</strong></td>
                <td>{lastUpload.rowsRejected}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {showDashboard && lastUpload && (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <button
              onClick={() => setShowDashboard(false)}
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              ← Back to Upload
            </button>
          </div>

          <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: 'var(--surface-2)', borderRadius: '8px' }}>
            <strong>{lastUpload.fileName}</strong>
            <div style={{ fontSize: '12px', color: 'var(--ink-2)', marginTop: '4px' }}>
              {lastUpload.rowsStored.toLocaleString()} checks stored · {lastUpload.rowsMerged} merged · {lastUpload.rowsFixed} fixed
            </div>
          </div>

          <Dashboard uploadId={lastUpload.id} />
          <Logs uploadId={lastUpload.id} />
        </div>
      )}

      {!showDashboard && uploads.length > 0 && (
        <div className="panel">
          <h2>Recent Uploads</h2>
          <table className="table">
            <thead>
              <tr>
                <th>File</th>
                <th>Uploaded</th>
                <th>Checks</th>
              </tr>
            </thead>
            <tbody>
              {uploads.slice(0, 10).map((u) => (
                <tr key={u.id}>
                  <td>{u.fileName}</td>
                  <td style={{ fontSize: '12px', color: 'var(--ink-2)' }}>
                    {new Date(u.uploadedAt).toLocaleString()}
                  </td>
                  <td>{u.rowsStored.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
