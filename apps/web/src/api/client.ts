const API_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000';

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
