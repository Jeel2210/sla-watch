// Use the Lambda Function URL for all API calls
const API_URL = import.meta.env.VITE_API_URL || 'https://nvxtvr5hy43lpsc5kvi22z2miu0htbmz.lambda-url.ap-south-1.on.aws';

export async function uploadCsv(file: File): Promise<{
  id: string;
  fileName: string;
  duplicate: boolean;
  rowsStored: number;
  rowsMerged: number;
  rowsFixed: number;
  rowsRejected: number;
}> {
  // For now, upload without gzip (browser will auto-compress if HTTPS)
  // TODO: add CompressionStream gzip when widely supported
  const response = await fetch(`${API_URL}/uploads`, {
    method: 'POST',
    body: file,
    headers: {
      'x-file-name': file.name,
    },
  });

  if (!response.ok) {
    const errorData = await response.json() as Record<string, any>;
    throw new Error(errorData.error || 'Upload failed');
  }

  return response.json() as Promise<{
    id: string;
    fileName: string;
    duplicate: boolean;
    rowsStored: number;
    rowsMerged: number;
    rowsFixed: number;
    rowsRejected: number;
  }>;
}

export async function getHealth(): Promise<{ ok: boolean; db: boolean }> {
  const response = await fetch(`${API_URL}/health`);
  return response.json();
}

export async function getUploads(options?: { cursor?: string; limit?: number; q?: string }) {
  const params = new URLSearchParams();
  if (options?.cursor) params.set('cursor', options.cursor);
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.q) params.set('q', options.q);

  const response = await fetch(`${API_URL}/uploads?${params}`);
  return response.json();
}

export async function getStats(uploadId: string) {
  const response = await fetch(`${API_URL}/uploads/${uploadId}/stats`);
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
}

export async function getLogs(uploadId: string, filters?: { from?: string; to?: string; service?: string; cursor?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  if (filters?.service) params.set('service', filters.service);
  if (filters?.cursor) params.set('cursor', filters.cursor);
  if (filters?.limit) params.set('limit', filters.limit.toString());

  const response = await fetch(`${API_URL}/uploads/${uploadId}/checks?${params}`);
  if (!response.ok) throw new Error('Failed to fetch logs');
  return response.json();
}
