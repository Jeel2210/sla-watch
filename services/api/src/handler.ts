import { handleUpload } from './routes/upload';
import { handleHealth } from './routes/health';
import { handleGetUploads } from './routes/getUploads';

const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-file-name',
};

export async function handler(event: any, context: any) {
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  const path = event.rawPath || event.path || '';

  // CORS preflight
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
    };
  }

  try {
    // POST /uploads
    if (path === '/uploads' && method === 'POST') {
      return await handleUpload(event, context);
    }

    // GET /uploads
    if (path === '/uploads' && method === 'GET') {
      return await handleGetUploads(event);
    }

    // GET /health
    if (path === '/health' && method === 'GET') {
      return await handleHealth();
    }

    // Placeholder for future routes (Phase 3)
    if (path.startsWith('/uploads/')) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
        body: JSON.stringify({ ok: true, data: [] }),
      };
    }

    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
      body: JSON.stringify({ error: 'Not found' }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
