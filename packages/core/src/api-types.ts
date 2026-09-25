// Response shapes of the HTTP API — the one contract shared by services/api (producer) and apps/web (consumer).
// Types only: nothing here runs.
import type { CleanErrorCode, CleanIssues, RejectedRow } from './types';
import type { RowSummary } from './summary';

/** ISO 8601 UTC timestamp, e.g. "2025-04-06T00:00:00.000Z". */
export type IsoTime = string;

/** One page of a cursor-paged list. `nextCursor` is opaque; pass it back unchanged. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** An upload as listed in the sidebar and the All uploads table. */
export interface UploadSummary extends RowSummary {
  id: string;
  fileName: string;
  uploadedAt: IsoTime;
  rangeStart: IsoTime;    // first check slot
  rangeEnd: IsoTime;      // last check slot
  days: number;
  intervalMin: number;
  services: number;
  expectedChecks: number;
}

/** `POST /uploads` → 201 (new) or 200 (same file uploaded before, `duplicate: true`). */
export interface UploadCreated extends UploadSummary {
  duplicate: boolean;
  issues: CleanIssues;
  rejectedSample: RejectedRow[];   // first rejected rows, for the result screen
}

/** Every error response. 422 from the cleaner adds what the header was missing and what it had. */
export interface ApiErrorBody {
  error: string;
  requestId: string;
  code?: CleanErrorCode;
  missing?: string[];
  found?: string[];
}
