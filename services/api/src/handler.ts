import { corsHeaders, json, runRoute, toReq, type ApiContext, type ApiEvent, type ApiResult, type Route } from './lib/http';
import { getHealth } from './routes/health';
import { getUploads } from './routes/getUploads';
import { getChecks, getHex, getIncidents, getServices, getStats, getTimeline, getUploadDetail } from './routes/reads';
import { postUpload } from './routes/upload';

/** Every route the API serves: "METHOD /path/:param". Anything else is 404. */
const ROUTES: [string, Route][] = [
  ['POST /uploads', postUpload],
  ['GET /uploads', getUploads],
  ['GET /uploads/:id', getUploadDetail],
  ['GET /uploads/:id/stats', getStats],
  ['GET /uploads/:id/services', getServices],
  ['GET /uploads/:id/services/:sid/hex', getHex],
  ['GET /uploads/:id/timeline', getTimeline],
  ['GET /uploads/:id/incidents', getIncidents],
  ['GET /uploads/:id/checks', getChecks],
  ['GET /health', getHealth],
];

/** "GET /uploads/:id" → matcher returning the decoded path parameters, or null. */
function matcher(pattern: string) {
  const [method, path] = pattern.split(' ') as [string, string];
  const names: string[] = [];
  const re = new RegExp(`^${path.replace(/:(\w+)/g, (_, name: string) => { names.push(name); return '([^/]+)'; })}$`);
  return (m: string, p: string) => {
    if (m !== method) return null;
    const hit = re.exec(p);
    if (!hit) return null;
    try {
      return Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(hit[i + 1]!)]));
    } catch {
      return null; // malformed %-encoding: not a route we serve
    }
  };
}
const TABLE = ROUTES.map(([pattern, route]) => ({ pattern, route, match: matcher(pattern) }));

export async function handler(event: ApiEvent, context: ApiContext = {}): Promise<ApiResult> {
  const method = event.requestContext?.http?.method ?? 'GET';
  const path = (event.rawPath ?? '/').replace(/\/+$/, '') || '/';
  if (method === 'OPTIONS') return { statusCode: 204, headers: corsHeaders() };

  for (const r of TABLE) {
    const params = r.match(method, path);
    if (params) return runRoute(r.pattern, r.route, toReq(event, context, params));
  }
  return json(404, { error: 'Not found', requestId: toReq(event, context).requestId });
}
