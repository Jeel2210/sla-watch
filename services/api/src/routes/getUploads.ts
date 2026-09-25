import type { Page, UploadSummary } from '@sla/core';
import { db } from '../db/client';
import { listUploads, toUploadSummary } from '../db/queries';
import type { Reply, Req } from '../lib/http';
import { decodeCursor, encodeCursor, intParam, likePattern, textParam } from '../lib/params';

/** GET /uploads?cursor&limit&q — newest first, search by file name (SECURITY.md: limit ≤ 50). */
export async function getUploads(req: Req): Promise<Reply> {
  const limit = intParam(req.query.limit, 'limit', { fallback: 20, min: 1, max: 50 });
  const q = textParam(req.query.q, 'q');
  const cursor = decodeCursor(req.query.cursor, 2);
  const { rows, hasMore } = await listUploads(db, {
    limit,
    search: q && likePattern(q),
    after: cursor && { uploadedAt: String(cursor[0]), id: String(cursor[1]) },
  });
  const last = rows[rows.length - 1];
  const body: Page<UploadSummary> = {
    items: rows.map(toUploadSummary),
    nextCursor: hasMore && last ? encodeCursor([last.uploaded_at.toISOString(), last.id]) : null,
  };
  return { status: 200, body };
}
