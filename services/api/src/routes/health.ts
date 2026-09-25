import { db } from '../db/client';
import type { Reply } from '../lib/http';

/** GET /health — 200 when the database answers, 503 when it doesn't. */
export async function getHealth(): Promise<Reply> {
  try {
    await db.query('select 1');
    return { status: 200, body: { ok: true, db: true } };
  } catch {
    return { status: 503, body: { ok: false, db: false } };
  }
}
