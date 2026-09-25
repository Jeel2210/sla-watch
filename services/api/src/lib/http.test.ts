import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError, runRoute, toReq } from './http';

const req = toReq({ headers: { 'x-file-name': 'a.csv' }, queryStringParameters: { limit: '5' } }, { awsRequestId: 'req-1' });
const log = vi.spyOn(console, 'log').mockImplementation(() => {});
afterEach(() => { log.mockClear(); });

describe('toReq', () => {
  it('reads the request id, query and headers', () => {
    expect(req.requestId).toBe('req-1');
    expect(req.query.limit).toBe('5');
    expect(req.header('X-File-Name')).toBe('a.csv');
  });
});

describe('runRoute', () => {
  it('returns the reply as JSON with CORS headers and logs one line', async () => {
    const res = await runRoute('GET /x', async () => ({ status: 201, body: { a: 1 }, log: { uploadId: 'u1', rows: 9 } }), req);
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body!)).toEqual({ a: 1 });
    expect(res.headers['Access-Control-Allow-Origin']).toBeDefined();
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({ requestId: 'req-1', route: 'GET /x', uploadId: 'u1', rows: 9, status: 201 });
  });
  it('HttpError → its status, message, extra fields and request id', async () => {
    const res = await runRoute('POST /x', async () => { throw new HttpError(422, 'Required columns are missing.', { missing: ['agent'] }); }, req);
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body!)).toEqual({ error: 'Required columns are missing.', missing: ['agent'], requestId: 'req-1' });
  });
  it('any other error → generic 500, details only in the log', async () => {
    const res = await runRoute('POST /x', async () => { throw new Error('relation "uploads" does not exist'); }, req);
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('relation');
    expect(JSON.parse(res.body!)).toEqual({ error: 'Internal server error', requestId: 'req-1' });
    expect(log.mock.calls[0]![0]).toContain('relation');
  });
});
