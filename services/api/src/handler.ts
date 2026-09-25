import { corsHeaders, json, runRoute, toReq, type ApiContext, type ApiEvent, type ApiResult, type Route } from './lib/http';
import { getHealth } from './routes/health';
import { getUploads } from './routes/getUploads';
import { postUpload } from './routes/upload';

/** Every route the API serves. Anything else is 404 — including the dashboard reads not built yet. */
const ROUTES: Record<string, Route> = {
  'POST /uploads': postUpload,
  'GET /uploads': getUploads,
  'GET /health': getHealth,
};

export async function handler(event: ApiEvent, context: ApiContext = {}): Promise<ApiResult> {
  const method = event.requestContext?.http?.method ?? 'GET';
  const path = (event.rawPath ?? '/').replace(/\/+$/, '') || '/';
  if (method === 'OPTIONS') return { statusCode: 204, headers: corsHeaders() };

  const key = `${method} ${path}`;
  const route = ROUTES[key];
  const req = toReq(event, context);
  if (!route) return json(404, { error: 'Not found', requestId: req.requestId });
  return runRoute(key, route, req);
}
