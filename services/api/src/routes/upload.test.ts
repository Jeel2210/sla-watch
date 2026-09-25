import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_FILE_BYTES, MAX_GZIP_BYTES } from '@sla/core';
import { uploadRow as fixture } from '../test/fixtures';
import type { ApiEvent } from '../lib/http';
import { handler } from '../handler';

// The database is mocked: these tests cover validation, cleaning and the response, not SQL.
const q = vi.hoisted(() => ({
  findUploadBySha256: vi.fn(),
  insertUpload: vi.fn(),
  rejectedSample: vi.fn(async () => []),
}));
vi.mock('../db/client', () => ({ db: {}, transaction: async (fn: (tx: object) => unknown) => fn({}) }));
vi.mock('../db/queries', async importOriginal => ({ ...(await importOriginal<object>()), ...q }));
vi.spyOn(console, 'log').mockImplementation(() => {});

const SAMPLE = readFileSync(new URL('../../../../data/samples/monitoring_checks_9d_seed101.csv', import.meta.url));
const post = (body: Buffer | string | null, fileName = 'checks.csv') => {
  const event: ApiEvent = {
    rawPath: '/uploads',
    requestContext: { http: { method: 'POST' } },
    headers: { 'x-file-name': fileName },
    body: body === null ? null : Buffer.isBuffer(body) ? body.toString('base64') : body,
    isBase64Encoded: Buffer.isBuffer(body),
  };
  return handler(event, { awsRequestId: 'req-1' });
};
const bodyOf = async (p: ReturnType<typeof post>) => { const r = await p; return { status: r.statusCode, body: JSON.parse(r.body!) }; };

const uploadRow = () => fixture({ range_end: new Date('2025-04-14T23:45:00Z'), services: 2, rows_total: 4672, rows_stored: 4320, rows_merged: 352, expected_checks: 4320 });

beforeEach(() => {
  q.findUploadBySha256.mockReset().mockResolvedValue(undefined);
  q.insertUpload.mockReset().mockImplementation(async () => uploadRow());
});

describe('POST /uploads — rejected before anything is stored', () => {
  it('no body → 400', async () => expect((await bodyOf(post(null))).status).toBe(400));
  it('compressed body over the limit → 413', async () => {
    expect((await bodyOf(post(Buffer.alloc(MAX_GZIP_BYTES + 1))))).toMatchObject({ status: 413 });
  });
  it('not gzip → 400', async () => expect((await bodyOf(post(Buffer.from('plain,csv\n'))))).toMatchObject({ status: 400, body: { error: 'The body is not valid gzip' } }));
  it('gzip bomb (small body, > 50 MB unpacked) → 413', async () => {
    expect((await bodyOf(post(gzipSync(Buffer.alloc(MAX_FILE_BYTES + 1)))))).toMatchObject({ status: 413 });
  });
  it('not UTF-8 → 400', async () => expect((await bodyOf(post(gzipSync(Buffer.from([0xff, 0xfe, 0x00])))))).toMatchObject({ status: 400 }));
  it('wrong columns → 422 listing what is missing and what was found', async () => {
    const r = await bodyOf(post(gzipSync('service,time,code\nsvc-a,2025-04-06T00:00:00Z,200\n')));
    expect(r).toMatchObject({
      status: 422,
      body: { code: 'MISSING_COLUMNS', found: ['service', 'time', 'code'], requestId: 'req-1' },
    });
    expect(r.body.missing).toContain('agent');
    expect(q.insertUpload).not.toHaveBeenCalled();
  });
  it('header only → 400 EMPTY', async () => {
    const r = await bodyOf(post(gzipSync('service_id,service_name,timestamp,status_code,latency,latency_unit,agent\n')));
    expect(r).toMatchObject({ status: 400, body: { code: 'EMPTY' } });
  });
});

describe('POST /uploads — stored', () => {
  it('new file → 201 with the summary from core (9-day sample)', async () => {
    const r = await bodyOf(post(gzipSync(SAMPLE)));
    expect(r.status).toBe(201);
    const input = q.insertUpload.mock.calls[0]![1];
    expect(input.summary).toEqual({ rowsTotal: 4672, rowsStored: 4320, rowsMerged: 352, rowsFixed: expect.any(Number), rowsRejected: 0 });
    expect(input.fileName).toBe('checks.csv');
    expect(r.body).toMatchObject({ id: 'u1', duplicate: false, days: 9, intervalMin: 15, rowsStored: 4320, rejectedSample: [] });
  });
  it('same file again → 200 duplicate, nothing inserted', async () => {
    q.findUploadBySha256.mockResolvedValue(uploadRow());
    const r = await bodyOf(post(gzipSync(SAMPLE)));
    expect(r).toMatchObject({ status: 200, body: { id: 'u1', duplicate: true } });
    expect(q.insertUpload).not.toHaveBeenCalled();
  });
  it('same file stored by a parallel request → 200 duplicate', async () => {
    q.insertUpload.mockResolvedValue(undefined);
    q.findUploadBySha256.mockResolvedValueOnce(undefined).mockResolvedValueOnce(uploadRow());
    expect(await bodyOf(post(gzipSync(SAMPLE)))).toMatchObject({ status: 200, body: { duplicate: true } });
  });
  it('database error → 500 without details', async () => {
    q.insertUpload.mockRejectedValue(new Error('duplicate key value violates unique constraint "checks_pkey"'));
    const r = await bodyOf(post(gzipSync(SAMPLE)));
    expect(r).toEqual({ status: 500, body: { error: 'Internal server error', requestId: 'req-1' } });
  });
});
