// The only module that calls fetch (RULES.md → Frontend). Response types come from @sla/core, shared with the API.
import { MAX_FILE_BYTES, MAX_GZIP_BYTES, type ApiErrorBody, type Page, type UploadCreated, type UploadSummary } from '@sla/core';

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
  const qs = params.size ? `?${params}` : '';
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

/** Gzips the CSV in the browser (ADR-005) and uploads it. Size limits are checked here first so users get a clear message. */
export async function uploadCsv(file: File, signal?: AbortSignal): Promise<UploadCreated> {
  if (!/\.csv$/i.test(file.name)) throw new ApiError(400, { error: 'Only .csv files can be uploaded.' });
  if (file.size > MAX_FILE_BYTES) throw new ApiError(413, { error: `The file is larger than ${MB(MAX_FILE_BYTES)}.` });
  const gzipped = await new Response(file.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  if (gzipped.size > MAX_GZIP_BYTES) {
    throw new ApiError(413, { error: `The file is ${MB(gzipped.size)} after compression; the limit is ${MB(MAX_GZIP_BYTES)}.` });
  }
  return request<UploadCreated>('/uploads', {
    method: 'POST',
    body: gzipped,
    headers: { 'Content-Type': 'application/gzip', 'x-file-name': file.name },
    signal,
  });
}

export const getHealth = (signal?: AbortSignal) => request<{ ok: boolean; db: boolean }>('/health', { signal });

export const getUploads = (opts: { cursor?: string; limit?: number; q?: string } = {}, signal?: AbortSignal) =>
  request<Page<UploadSummary>>('/uploads', { query: opts, signal });

// Dashboard reads: not served by the API yet (404) — kept so the current screens compile; typed with the read endpoints.
export const getStats = <T,>(uploadId: string, signal?: AbortSignal) =>
  request<T>(`/uploads/${encodeURIComponent(uploadId)}/stats`, { signal });

export const getLogs = <T,>(uploadId: string, filters: Query = {}, signal?: AbortSignal) =>
  request<T>(`/uploads/${encodeURIComponent(uploadId)}/checks`, { query: filters, signal });
