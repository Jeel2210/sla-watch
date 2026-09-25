// The only module that calls fetch (RULES.md → Frontend). Response types come from @sla/core, shared with the API.
import {
  MAX_FILE_BYTES, MAX_GZIP_BYTES,
  type ApiErrorBody, type ChecksPage, type HexPage, type IncidentRow, type LogSort, type LogTab, type Page,
  type ServicesPage, type TimelinePage, type UploadCreated, type UploadDetail, type UploadStats, type UploadSummary,
} from '@sla/core';

/** A failed request, with the API's error body when there is one. */
export class ApiError extends Error {
  constructor(public status: number, public body: Partial<ApiErrorBody>) {
    super(body.error ?? `Request failed (${status})`);
    this.name = 'ApiError';
  }
}

function apiUrl(): string {
  const url = import.meta.env.VITE_API_URL;
  if (!url) throw new ApiError(0, { error: 'VITE_API_URL is not set. Add it to apps/web/.env.local (see .env.example).' });
  return url.replace(/\/+$/, '');
}

type Query = Record<string, string | number | undefined>;

async function request<T>(path: string, init: RequestInit & { query?: Query } = {}): Promise<T> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined && v !== '') params.set(k, String(v));
  const qs = params.toString() ? `?${params}` : '';
  let res: Response;
  try {
    res = await fetch(`${apiUrl()}${path}${qs}`, init);
  } catch (e) {
    if (e instanceof ApiError || (e instanceof DOMException && e.name === 'AbortError')) throw e;
    throw new ApiError(0, { error: 'Could not reach the server. Check your connection and try again.' });
  }
  // Errors raised before our code runs (e.g. the Function URL's own size limit) are not JSON.
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body as Partial<ApiErrorBody>);
  return body as T;
}

const MB = (n: number) => `${Math.round(n / 1_000_000)} MB`;
const up = (id: string) => `/uploads/${encodeURIComponent(id)}`;

/** Checks the file before anything is sent: .csv, ≤ 50 MB. Returns the message to show, or null. */
export function checkFile(file: File): string | null {
  if (!/\.csv$/i.test(file.name)) return 'Only .csv files can be uploaded.';
  if (file.size > MAX_FILE_BYTES) return `The file is larger than ${MB(MAX_FILE_BYTES)}.`;
  return null;
}

/** Gzips the CSV in the browser (ADR-005). */
export async function gzipFile(file: File): Promise<Blob> {
  const gz = await new Response(file.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  if (gz.size > MAX_GZIP_BYTES) throw new ApiError(413, { error: `The file is ${MB(gz.size)} after compression; the limit is ${MB(MAX_GZIP_BYTES)}.` });
  return gz;
}

export function postUpload(fileName: string, gzipped: Blob, signal?: AbortSignal): Promise<UploadCreated> {
  return request<UploadCreated>('/uploads', {
    method: 'POST',
    body: gzipped,
    headers: { 'Content-Type': 'application/gzip', 'x-file-name': fileName },
    signal,
  });
}

export const getUploads = (q: { cursor?: string; limit?: number; q?: string } = {}, signal?: AbortSignal) =>
  request<Page<UploadSummary>>('/uploads', { query: q, signal });

export const getUpload = (id: string, signal?: AbortSignal) => request<UploadDetail>(up(id), { signal });

export const getStats = (id: string, signal?: AbortSignal) => request<UploadStats>(`${up(id)}/stats`, { signal });

export const getServices = (id: string, q: { q?: string; cursor?: string; limit?: number }, signal?: AbortSignal) =>
  request<ServicesPage>(`${up(id)}/services`, { query: q, signal });

export const getHex = (id: string, serviceId: string, q: { from: number; days: number }, signal?: AbortSignal) =>
  request<HexPage>(`${up(id)}/services/${encodeURIComponent(serviceId)}/hex`, { query: q, signal });

export const getTimeline = (id: string, q: { bins: number; offset: number; limit: number }, signal?: AbortSignal) =>
  request<TimelinePage>(`${up(id)}/timeline`, { query: q, signal });

export const getIncidents = (id: string, q: { cursor?: string; limit?: number }, signal?: AbortSignal) =>
  request<Page<IncidentRow>>(`${up(id)}/incidents`, { query: q, signal });

/** Logs filters. `to` is exclusive. */
export interface ChecksQuery {
  from?: string;
  to?: string;
  service?: string;
  agent?: string;
  region?: string;
  tab: LogTab;
  sort: LogSort;
}

export const getChecks = (id: string, q: ChecksQuery & { cursor?: string; limit: number }, signal?: AbortSignal) =>
  request<ChecksPage>(`${up(id)}/checks`, { query: { ...q }, signal });
