// Test-only: API responses shaped like the live API's (30-day sample).
import type { UploadDetail, UploadSummary } from '@sla/core';

export function uploadSummary(over: Partial<UploadSummary> = {}): UploadSummary {
  return {
    id: 'u30', fileName: 'monitoring_checks_30d_seed404.csv', uploadedAt: '2026-09-25T09:00:00.000Z',
    rangeStart: '2025-04-06T00:00:00.000Z', rangeEnd: '2025-05-05T23:45:00.000Z', days: 30, intervalMin: 15, services: 5,
    expectedChecks: 14400, rowsTotal: 15577, rowsStored: 14400, rowsMerged: 1177, rowsFixed: 3280, rowsRejected: 0, missedSla: 5,
    ...over,
  };
}

export function uploadDetail(over: Partial<UploadDetail> = {}): UploadDetail {
  return {
    ...uploadSummary(),
    issues: {
      exactDuplicates: 24, epoch: 233, offset: 109, offsets: { '+05:30': 109 }, unitConverted: { s: 3090 }, unitCase: 0, trimmed: 0,
      latencyMissing: 186, latencyNegative: 1, invalidStatus: 1, status4xx: 0, snapped: 0, mergedRows: 1153,
    },
    agents: ['agent-1', 'agent-2'], regions: ['ap-south-1'], intervalHits: 14395, totalGaps: 14395,
    serviceNames: ['auth-api', 'notify-api', 'payments-api', 'reports-api', 'search-api'], rejectedSample: [],
    ...over,
  };
}

export const page = <T,>(items: T[], nextCursor: string | null = null) => ({ items, nextCursor });
