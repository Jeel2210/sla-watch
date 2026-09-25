import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStats } from '../api/client';

interface ServiceStat {
  service_id: string;
  valid: number;
  failed: number;
  present: number;
  availability: number | null;
  downtime_min: number;
  p50_ms: number | null;
  p95_ms: number | null;
  incidents: number;
  longest_incident_min: number | null;
}

export function Dashboard({ uploadId }: { uploadId: string }) {
  const [collapsed, setCollapsed] = useState(false);

  // Fetch service stats from API using TanStack Query
  const statsQuery = useQuery({
    queryKey: ['stats', uploadId],
    queryFn: ({ signal }) => getStats<{ stats: ServiceStat[]; incidents: number; missedSla: number }>(uploadId, signal),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  if (statsQuery.isPending) return <div className="loading">Loading stats...</div>;
  if (statsQuery.isError) return <div className="error">Failed to load stats</div>;

  const data = statsQuery.data;
  const worst = data.stats[0];
  const met = !data.missedSla;

  return (
    <div className="panel">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <h2>STATS {collapsed ? '▼' : '▲'}</h2>
        <button onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {!collapsed && (
        <div>
          <div className="stat-strip">
            <div className="stat-cell">
              <div className="stat-label">SLA Status</div>
              <div className={`pill ${met ? 'met' : 'missed'}`}>
                {met ? '✓ Met' : '✗ Missed'}
              </div>
            </div>

            <div className="stat-cell">
              <div className="stat-label">Incidents</div>
              <div className="stat-value">{data.incidents}</div>
              <div className="stat-desc">outages detected</div>
            </div>

            <div className="stat-cell">
              <div className="stat-label">Lowest Service</div>
              <div className="stat-value">
                {worst ? `${(worst.availability || 0).toFixed(2)}%` : '—'}
              </div>
              <div className="stat-desc">{worst?.service_id || 'N/A'}</div>
            </div>

            <div className="stat-cell">
              <div className="stat-label">Checks Stored</div>
              <div className="stat-value">{data.stats.length}</div>
              <div className="stat-desc">services</div>
            </div>

            <div className="stat-cell">
              <div className="stat-label">View</div>
              <div style={{ marginTop: '8px' }}>
                <button className="primary" style={{ fontSize: '12px' }}>
                  Hex Map
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
