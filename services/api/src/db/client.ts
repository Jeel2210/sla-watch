import { Pool, QueryConfig } from 'pg';
import { neonConfig } from '@neondatabase/serverless';

neonConfig.useSecureWebSocket = true;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export interface QueryResult<T = Record<string, any>> {
  rows: T[];
  rowCount: number | null;
}

export async function query<T = Record<string, any>>(
  text: string,
  values?: any[]
): Promise<QueryResult<T>> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, values);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount,
    };
  } finally {
    client.release();
  }
}

export async function transaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function queryTx(
  client: any,
  text: string,
  values?: any[]
): Promise<QueryResult> {
  const result = await client.query(text, values);
  return {
    rows: result.rows,
    rowCount: result.rowCount,
  };
}

export { pool };
