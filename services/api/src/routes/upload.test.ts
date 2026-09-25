import { describe, it, expect, vi } from 'vitest';
import { handleUpload } from './upload';

describe('POST /uploads', () => {
  it('should reject empty body', async () => {
    const result = await handleUpload(
      { body: '', isBase64Encoded: false, headers: {} },
      { requestId: 'test-1' }
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toHaveProperty('error');
  });

  it('should reject oversized bodies', async () => {
    const largeBody = 'x'.repeat(7_000_000);
    const result = await handleUpload(
      { body: largeBody, isBase64Encoded: false, headers: {} },
      { requestId: 'test-2' }
    );
    expect(result.statusCode).toBe(413);
  });
});
