import { BATCH_SIZE, batches } from '@sla/core';
import type { Db } from './client';

/** Postgres accepts at most this many bind parameters in one statement. */
const PG_MAX_PARAMS = 65_535;

/**
 * Batched insert (ADR-011): one parameterised multi-row INSERT per batch of BATCH_SIZE rows, fewer when
 * the column count would pass Postgres's parameter limit. Call it inside `transaction()` so one failed
 * batch rolls back the whole upload.
 * `table` and `columns` are fixed names from our own code, never user input; every value is a parameter.
 */
export async function insertRows(db: Db, table: string, columns: readonly string[], rows: readonly unknown[][]): Promise<void> {
  const size = Math.min(BATCH_SIZE, Math.floor(PG_MAX_PARAMS / columns.length));
  const head = `insert into ${table} (${columns.join(', ')}) values `;
  for (const batch of batches(rows, size)) {
    const tuples = batch.map((_, r) => `(${columns.map((_, c) => `$${r * columns.length + c + 1}`).join(', ')})`);
    await db.query(head + tuples.join(', '), batch.flat());
  }
}
