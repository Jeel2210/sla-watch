import { BATCH_SIZE, batches } from '@sla/core';
import type { Db } from './client';

/**
 * A text[] value as a Postgres array literal, e.g. ["a","b\"c"] → {"a","b\"c"}. Sent as a parameter,
 * so it is data, never SQL; drivers differ in how (or whether) they convert JS arrays themselves.
 */
export const pgTextArray = (values: readonly string[]) =>
  `{${values.map(v => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;

/**
 * Bind parameters per statement. The protocol field is 16 bits: Postgres and node-postgres read it unsigned
 * (65,535) but some clients read it signed, so 32,767 is the limit every driver handles (found with PGlite).
 */
const PG_MAX_PARAMS = 32_767;

/**
 * Batched insert (ADR-011): one parameterised multi-row INSERT per batch of BATCH_SIZE rows, fewer when
 * the column count would pass PG_MAX_PARAMS. Call it inside `transaction()` so one failed
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
