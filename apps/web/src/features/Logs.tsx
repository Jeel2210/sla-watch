import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLogs } from '../api/client';

interface Check {
  upload_id: string;
  service_id: string;
  slot_ts: string;
  status_code: number;
  is_valid: boolean;
  is_failed: boolean;
  latency_ms: number | null;
  agents: string[];
  region: string | null;
  quality_flags: string[];
}

export function Logs({ uploadId }: { uploadId: string }) {
  const [showFilters, setShowFilters] = useState(false);
  const [filterService, setFilterService] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [tab, setTab] = useState<'all' | 'failed' | 'changed'>('all');

  const logsQuery = useQuery({
    queryKey: ['logs', uploadId, { service: filterService, status: filterStatus }],
    queryFn: ({ signal }) => getLogs<{ rows: Check[] }>(uploadId, { service: filterService }, signal),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  if (logsQuery.isPending) return <div className="loading">Loading logs...</div>;

  const checks = logsQuery.data?.rows ?? [];
  const failedCount = checks.filter((c) => c.is_failed).length;
  const changedCount = checks.filter((c) => c.quality_flags.length > 0).length;

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>LOGS · UTC</h2>
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            backgroundColor: showFilters ? 'var(--accent)' : 'var(--surface-2)',
            color: showFilters ? 'white' : 'var(--ink)',
          }}
        >
          ⚙ Filters {showFilters && <span style={{ marginLeft: '4px' }}>✓</span>}
        </button>
      </div>

      {showFilters && (
        <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: 'var(--surface-2)', borderRadius: '8px' }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
              Service
            </label>
            <input
              type="text"
              placeholder="Filter by service..."
              value={filterService}
              onChange={(e) => setFilterService(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
              Status Code
            </label>
            <input
              type="text"
              placeholder="e.g., 500"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <button
            onClick={() => {
              setFilterService('');
              setFilterStatus('');
            }}
            style={{ padding: '8px 12px', fontSize: '12px' }}
          >
            Reset Filters
          </button>
        </div>
      )}

      <div style={{ marginBottom: '16px', display: 'flex', gap: '0', borderBottom: '1px solid var(--line)' }}>
        {[
          { id: 'all', label: `All ${checks.length}` },
          { id: 'failed', label: `Failed ${failedCount}` },
          { id: 'changed', label: `Changed ${changedCount}` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            style={{
              padding: '12px 16px',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: tab === t.id ? '600' : '400',
              color: tab === t.id ? 'var(--accent)' : 'var(--ink-2)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {checks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-2)' }}>
          No checks found for these filters.
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Time (UTC)</th>
              <th>Service</th>
              <th>Status</th>
              <th>Latency</th>
              <th>Agent</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((check) => (
              <tr
                key={`${check.slot_ts}-${check.service_id}`}
                style={check.is_failed ? { backgroundColor: 'var(--crit-soft)' } : {}}
              >
                <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                  {new Date(check.slot_ts).toLocaleString()}
                </td>
                <td>{check.service_id}</td>
                <td
                  style={{
                    color: check.is_failed ? 'var(--crit)' : check.is_valid ? 'var(--good)' : 'var(--muted)',
                    fontWeight: '600',
                  }}
                >
                  {check.status_code}
                </td>
                <td>{check.latency_ms ? `${check.latency_ms}ms` : '—'}</td>
                <td>{check.agents.join(', ')}</td>
                <td style={{ fontSize: '11px' }}>
                  {check.quality_flags.length > 0 ? check.quality_flags.join(', ') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
