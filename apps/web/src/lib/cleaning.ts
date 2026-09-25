// What the cleaner did, in the user's words. Shared by the upload result and the data report.
import type { CleanIssues } from '@sla/core';

export interface Fix { label: string; detail: string; count: number }

/** Every fix with a count above zero, in the order a reader cares about. */
export function fixList(i: CleanIssues): Fix[] {
  const offsets = Object.keys(i.offsets).join(', ');
  const fixes: Fix[] = [
    { label: 'Duplicate reports merged', detail: 'Same service and time slot, from two agents or repeated lines. One check kept; a failure wins if they disagree.', count: i.mergedRows + i.exactDuplicates },
    { label: 'Unix epoch timestamps', detail: 'Converted to UTC.', count: i.epoch },
    { label: `Timestamps with an offset${offsets ? ` (${offsets})` : ''}`, detail: 'Converted to UTC using the offset in the value.', count: i.offset },
    ...Object.entries(i.unitConverted).map(([unit, count]) => ({ label: `Latency in "${unit}"`, detail: 'Converted to ms.', count })),
    { label: 'Blank latency', detail: 'Check kept; latency left empty. The status still counts.', count: i.latencyMissing },
    { label: 'Negative latency', detail: 'Impossible value; latency removed. The status still counts.', count: i.latencyNegative },
    { label: 'Fields with extra spaces', detail: 'Trimmed before checking.', count: i.trimmed },
    { label: 'Units in upper case ("S", "MS")', detail: 'Read case-insensitively.', count: i.unitCase },
    { label: 'Timestamps off the check grid', detail: 'Moved to the nearest check slot.', count: i.snapped },
    { label: '4xx responses', detail: 'Counted as up: the service answered. Only 5xx counts as downtime.', count: i.status4xx },
    { label: 'Invalid status code', detail: 'Not a valid HTTP code (100–599). Left out of availability unless another agent reported a valid status.', count: i.invalidStatus },
  ];
  return fixes.filter(f => f.count > 0);
}

/** Timestamps converted to UTC and latencies converted to ms. */
export function conversions(i: CleanIssues): { timestamps: number; latencies: number } {
  let latencies = 0;
  for (const n of Object.values(i.unitConverted)) latencies += n;
  return { timestamps: i.epoch + i.offset, latencies };
}
