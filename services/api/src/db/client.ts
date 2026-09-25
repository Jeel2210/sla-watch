import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/** Anything that can run a query: the pool or a client inside a transaction. */
export interface Db {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<pg.QueryResult<R>>;
}

export const db: Db = pool;

/** Runs `fn` in one transaction: commit on success, roll back on any error (ADR-011, SECURITY.md T12). */
export async function transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}
