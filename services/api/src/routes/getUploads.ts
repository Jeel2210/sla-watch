import { query } from '../db/client';
import * as queries from '../db/queries';

export async function handleGetUploads(event: any): Promise<{
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}> {
  try {
    const queryParams = event.queryStringParameters || {};
    const cursor = queryParams.cursor;
    const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : 20;
    const q = queryParams.q;

    const result = await queries.listUploads({ cursor, limit, q });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      },
      body: JSON.stringify({
        uploads: result.rows.map((u) => ({
          id: u.id,
          fileName: u.file_name,
          uploadedAt: u.uploaded_at,
          rangeStart: u.range_start,
          rangeEnd: u.range_end,
          services: u.services,
          rowsStored: u.rows_stored,
        })),
        nextCursor: result.nextCursor,
      }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      },
      body: JSON.stringify({ error: 'Failed to fetch uploads' }),
    };
  }
}
