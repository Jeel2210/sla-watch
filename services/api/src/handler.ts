import { handleUpload } from './routes/upload';
import { handleHealth } from './routes/health';
import { handleGetUploads } from './routes/getUploads';

export async function handler(event: any, context: any) {
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  const path = event.rawPath || event.path || '';

  // CORS preflight
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-file-name',
      },
    };
  }

  try {
    if (path === '/health' && method === 'GET') {
      return await handleHealth();
    }

    if (path === '/uploads' && method === 'POST') {
      return await handleUpload(event, context);
    }

    if (path === '/uploads' && method === 'GET') {
      return await handleGetUploads(event);
    }

    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      },
      body: JSON.stringify({ error: 'Not found' }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
