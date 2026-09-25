import type { CleanOk, Incident } from './types';

/** Where the uploaded rows went — the numbers stored on `uploads` and shown in the data report. */
export interface RowSummary {
  rowsTotal: number;      // non-empty data lines in the file
  rowsStored: number;     // checks after merging (one per service per slot)
  rowsMerged: number;     // repeated lines + extra agent reports folded into another check
  rowsFixed: number;      // stored checks that needed a correction (timestamp, unit, latency, status, snap)
  rowsRejected: number;   // lines that could not be read
}

export function rowSummary(r: CleanOk): RowSummary {
  let rowsFixed = 0;
  for (const c of r.checks) if (c.flags.some(f => f !== 'merged')) rowsFixed++;
  return {
    rowsTotal: r.rowsTotal,
    rowsStored: r.checks.length,
    rowsMerged: r.issues.mergedRows + r.issues.exactDuplicates,
    rowsFixed,
    rowsRejected: r.rejected.length,
  };
}

export interface ServiceIncidents { count: number; longestMin: number | null }

/** Incident count and longest incident (minutes) per service. Services without incidents are absent. */
export function incidentsByService(incidents: readonly Incident[]): Map<string, ServiceIncidents> {
  const out = new Map<string, ServiceIncidents>();
  for (const i of incidents) {
    const minutes = Math.round((i.end - i.start) / 60_000);
    const cur = out.get(i.serviceId);
    if (!cur) out.set(i.serviceId, { count: 1, longestMin: minutes });
    else {
      cur.count++;
      if (cur.longestMin === null || minutes > cur.longestMin) cur.longestMin = minutes;
    }
  }
  return out;
}
