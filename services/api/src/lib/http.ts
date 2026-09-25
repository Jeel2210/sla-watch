import type { ApiErrorBody } from '@sla/core';

/** The parts of a Lambda Function URL event the API reads. */
export interface ApiEvent {
  rawPath?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  requestContext?: { http?: { method?: string } };
}
export interface ApiContext { awsRequestId?: string }
export interface ApiResult { statusCode: number; headers: Record<string, string>; body?: string }

/** What a route handler receives. */
export interface Req {
  event: ApiEvent;
  requestId: string;
  /** Path parameters, e.g. `id` in /uploads/:id. */
  params: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  header(name: string): string | undefined;
}
/** What a route handler returns; `log` adds fields to the request's log line. */
export interface Reply { status: number; body: unknown; log?: { uploadId?: string; rows?: number } }
export type Route = (req: Req) => Promise<Reply>;

/** An error whose message is safe to show the user. Anything else becomes a generic 500. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Partial<ApiErrorBody> = {}) {
    super(message);
    this.name = 'HttpError';
  }
}

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-file-name',
  };
}

export function json(statusCode: number, body: unknown): ApiResult {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...corsHeaders() }, body: JSON.stringify(body) };
}

export function toReq(event: ApiEvent, context: ApiContext, params: Record<string, string | undefined> = {}): Req {
  const headers = event.headers ?? {};
  return {
    event,
    requestId: context.awsRequestId ?? crypto.randomUUID(),
    params,
    query: event.queryStringParameters ?? {},
    header: name => headers[name.toLowerCase()],
  };
}

/**
 * Runs one route: turns HttpError into `{ error, requestId }` with its status, anything else into a
 * generic 500 (details only in the log, SECURITY.md T10), and logs one JSON line per request.
 */
export async function runRoute(name: string, route: Route, req: Req): Promise<ApiResult> {
  const started = Date.now();
  let status = 500;
  let log: Reply['log'] = {};
  let error: string | undefined;
  try {
    const reply = await route(req);
    status = reply.status;
    log = reply.log ?? {};
    return json(reply.status, reply.body);
  } catch (e) {
    if (e instanceof HttpError) {
      status = e.status;
      error = e.message;
      const body: ApiErrorBody = { ...e.extra, error: e.message, requestId: req.requestId };
      return json(e.status, body);
    }
    error = e instanceof Error ? e.message : String(e);
    const body: ApiErrorBody = { error: 'Internal server error', requestId: req.requestId };
    return json(500, body);
  } finally {
    console.log(JSON.stringify({ requestId: req.requestId, route: name, ...log, status, ms: Date.now() - started, ...(error ? { error } : {}) }));
  }
}
