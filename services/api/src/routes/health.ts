import { query } from '../db/client';

export async function handleHealth(): Promise<{
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}> {
  try {
    await query('select 1');
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      },
      body: JSON.stringify({ ok: true, db: true }),
    };
  } catch {
    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      },
      body: JSON.stringify({ ok: false, db: false }),
    };
  }
}
