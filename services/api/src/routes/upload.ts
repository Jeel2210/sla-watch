import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import {
  MAX_FILE_BYTES, MAX_GZIP_BYTES, cleanCsv, detectIncidents, hourlyFailures, rowSummary, serviceStats,
  type CleanErrorCode, type UploadCreated,
} from '@sla/core';
import { db, transaction } from '../db/client';
import { findUploadBySha256, insertUpload, rejectedSample, toUploadSummary, type UploadRow } from '../db/queries';
import { HttpError, type ApiEvent, type Reply, type Req } from '../lib/http';
import { fileNameParam } from '../lib/params';

const REJECTED_SAMPLE = 10;
const MB = (n: number) => `${Math.round(n / 1_000_000)} MB`;

/** Status per cleaner error: wrong or unreadable content is 422, an empty file 400, too many rows 413. */
const CLEAN_STATUS: Record<CleanErrorCode, number> = { EMPTY: 400, MISSING_COLUMNS: 422, NO_READABLE_ROWS: 422, TOO_MANY_ROWS: 413 };

/** Request body → CSV text: size-capped gzip, decompressed with a hard cap (gzip-bomb guard), strict UTF-8. */
function readCsvBody(event: ApiEvent): Buffer {
  if (!event.body) throw new HttpError(400, 'The request has no file');
  const gz = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
  if (gz.length > MAX_GZIP_BYTES) throw new HttpError(413, `The compressed file is larger than ${MB(MAX_GZIP_BYTES)}`);
  try {
    return gunzipSync(gz, { maxOutputLength: MAX_FILE_BYTES });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') throw new HttpError(413, `The file is larger than ${MB(MAX_FILE_BYTES)}`);
    throw new HttpError(400, 'The body is not valid gzip');
  }
}

function decodeUtf8(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new HttpError(400, 'The file is not UTF-8 text');
  }
}

async function created(u: UploadRow, duplicate: boolean): Promise<UploadCreated> {
  return { ...toUploadSummary(u), duplicate, issues: u.issues, rejectedSample: await rejectedSample(db, u.id, REJECTED_SAMPLE) };
}

/** POST /uploads — 201 new upload, 200 same file uploaded before; nothing is stored on any error. */
export async function postUpload(req: Req): Promise<Reply> {
  const fileName = fileNameParam(req.header('x-file-name'));
  const bytes = readCsvBody(req.event);
  const text = decodeUtf8(bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  const existing = await findUploadBySha256(db, sha256);
  if (existing) return { status: 200, body: await created(existing, true), log: { uploadId: existing.id, rows: existing.rows_stored } };

  // Clean before opening the transaction: CPU work must not hold a database connection.
  const clean = cleanCsv(text);
  if (!clean.ok) {
    throw new HttpError(CLEAN_STATUS[clean.code], clean.message, { code: clean.code, missing: clean.missing, found: clean.found });
  }
  const input = {
    fileName, sha256, clean, summary: rowSummary(clean),
    stats: serviceStats(clean), incidents: detectIncidents(clean), hourly: hourlyFailures(clean),
  };
  const stored = await transaction(tx => insertUpload(tx, input));
  // undefined: the same file was stored by a parallel request between our lookup and insert.
  const upload = stored ?? (await findUploadBySha256(db, sha256));
  if (!upload) throw new Error('Upload vanished after a sha256 conflict');
  return { status: stored ? 201 : 200, body: await created(upload, !stored), log: { uploadId: upload.id, rows: upload.rows_stored } };
}
