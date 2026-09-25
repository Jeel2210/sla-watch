import { describe, expect, it } from 'vitest';
import { HttpError } from './http';
import { decodeCursor, encodeCursor, fileNameParam, intParam, likePattern, textParam } from './params';

const status = (fn: () => unknown) => {
  try { fn(); } catch (e) { return e instanceof HttpError ? e.status : 'not HttpError'; }
  return 'no error';
};

describe('intParam', () => {
  const opts = { fallback: 20, min: 1, max: 50 };
  it('uses the fallback when missing', () => expect(intParam(undefined, 'limit', opts)).toBe(20));
  it('parses a whole number in range', () => expect(intParam('7', 'limit', opts)).toBe(7));
  it.each(['abc', '1.5', '0', '51', '10; drop table uploads'])('rejects %s with 400', v => {
    expect(status(() => intParam(v, 'limit', opts))).toBe(400);
  });
});

describe('cursor', () => {
  it('round-trips values containing ":" (ISO timestamps)', () => {
    const values = ['2026-09-25T12:32:39.000Z', 'b7f7a3a0-1111-4222-8333-444455556666'];
    expect(decodeCursor(encodeCursor(values), 2)).toEqual(values);
  });
  it('missing → undefined', () => expect(decodeCursor(undefined, 2)).toBeUndefined());
  it.each(['not-base64-json', encodeCursor(['only-one']), encodeCursor([{}, 'x'] as never)])('invalid %s → 400', c => {
    expect(status(() => decodeCursor(c, 2))).toBe(400);
  });
});

describe('text inputs', () => {
  it('textParam trims, drops empty, caps length', () => {
    expect(textParam('  30d ', 'q')).toBe('30d');
    expect(textParam('   ', 'q')).toBeUndefined();
    expect(status(() => textParam('x'.repeat(201), 'q'))).toBe(400);
  });
  it('likePattern matches % and _ literally', () => expect(likePattern('50%_a\\b')).toBe('%50\\%\\_a\\\\b%'));
  it('fileNameParam keeps the basename only, ≤ 200 chars', () => {
    expect(fileNameParam('C:\\Users\\me\\checks.csv')).toBe('checks.csv');
    expect(fileNameParam('../../etc/passwd')).toBe('passwd');
    expect(fileNameParam(undefined)).toBe('upload.csv');
    expect(fileNameParam('a'.repeat(300) + '.csv')).toHaveLength(200);
  });
});
