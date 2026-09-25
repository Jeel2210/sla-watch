// Test-only: a stored upload row (30-day sample shape) for tests that mock the database.
import type { UploadRow } from '../db/queries';

export function uploadRow(over: Partial<UploadRow> = {}): UploadRow {
  return {
    id: 'u1', file_name: 'checks.csv', file_sha256: 'x', uploaded_at: new Date('2026-09-25T00:00:00Z'),
    range_start: new Date('2025-04-06T00:00:00Z'), range_end: new Date('2025-05-05T23:45:00Z'), interval_min: 15, services: 5,
    rows_total: 15577, rows_stored: 14400, rows_merged: 1177, rows_fixed: 3280, rows_rejected: 0, expected_checks: 14400,
    issues: {} as UploadRow['issues'], agents: ['agent-1', 'agent-2'], regions: ['ap-south-1'], interval_hits: 14395, total_gaps: 14395,
    ...over,
  };
}
