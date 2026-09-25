import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadRow } from './db/queries';
import { decodeCursor, encodeCursor } from './lib/params';
import { handler } from './handler';

const list = vi.hoisted(() => vi.fn());
const dbQuery = vi.hoisted(() => vi.fn());
vi.mock('./db/client', () => ({ db: { query: dbQuery }, transaction: vi.fn() }));
vi.mock('./db/queries', async importOriginal => ({ ...(await importOriginal<object>()), listUploads: list }));
vi.spyOn(console, 'log').mockImplementation(() => {});

const get = (rawPath: string, query: Record<string, string | undefined> = {}) =>
  handler({ rawPath, requestContext: { http: { method: 'GET' } }, queryStringParameters: query }, { awsRequestId: 'req-1' });

const row = (id: string, at: string): UploadRow => ({
  id, file_name: `${id}.csv`, file_sha256: id, uploaded_at: new Date(at), range_start: new Date('2025-04-06T00:00:00Z'),
  range_end: new Date('2025-05-05T23:45:00Z'), interval_min: 15, services: 5, rows_total: 15577, rows_stored: 14400,
  rows_merged: 1177, rows_fixed: 3280, rows_rejected: 0, expected_checks: 14400, issues: {} as UploadRow['issues'],
});

beforeEach(() => { list.mockReset(); dbQuery.mockReset(); });

describe('routing', () => {
  it('OPTIONS → 204 with CORS headers', async () => {
    const r = await handler({ rawPath: '/uploads', requestContext: { http: { method: 'OPTIONS' } } });
    expect(r.statusCode).toBe(204);
    expect(r.headers['Access-Control-Allow-Methods']).toContain('POST');
  });
  it.each(['/nope', '/uploads/abc/stats', '/uploads/abc/checks'])('%s → 404 (not built yet, never an empty 200)', async path => {
    const r = await get(path);
    expect(r.statusCode).toBe(404);
    expect(JSON.parse(r.body!)).toEqual({ error: 'Not found', requestId: 'req-1' });
  });
  it('trailing slash is ignored', async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    expect((await get('/health/')).statusCode).toBe(200);
  });
  it('health → 503 when the database is down', async () => {
    dbQuery.mockRejectedValue(new Error('connect ECONNREFUSED'));
    expect((await get('/health')).statusCode).toBe(503);
  });
});

describe('GET /uploads', () => {
  it('returns a page with an opaque cursor that survives ":" in timestamps', async () => {
    list.mockResolvedValue({ rows: [row('a', '2026-09-25T12:32:39Z'), row('b', '2026-09-25T10:00:00Z')], hasMore: true });
    const r = JSON.parse((await get('/uploads', { limit: '2' })).body!);
    expect(r.items.map((u: { id: string }) => u.id)).toEqual(['a', 'b']);
    expect(r.items[0]).toMatchObject({ fileName: 'a.csv', days: 30, rowsTotal: 15577, uploadedAt: '2026-09-25T12:32:39.000Z' });
    expect(decodeCursor(r.nextCursor, 2)).toEqual(['2026-09-25T10:00:00.000Z', 'b']);
  });
  it('passes the decoded cursor and an escaped search to the query', async () => {
    list.mockResolvedValue({ rows: [], hasMore: false });
    const cursor = encodeCursor(['2026-09-25T10:00:00.000Z', 'b']);
    const r = JSON.parse((await get('/uploads', { cursor, q: '30d_%' })).body!);
    expect(r).toEqual({ items: [], nextCursor: null });
    expect(list.mock.calls[0]![1]).toEqual({ limit: 20, search: '%30d\\_\\%%', after: { uploadedAt: '2026-09-25T10:00:00.000Z', id: 'b' } });
  });
  it.each([{ limit: 'abc' }, { limit: '51' }, { cursor: 'garbage' }])('bad input %o → 400', async query => {
    expect((await get('/uploads', query)).statusCode).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });
});
