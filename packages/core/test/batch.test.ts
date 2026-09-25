import { describe, expect, it } from 'vitest';
import { BATCH_SIZE, batches } from '../src/index';
import { cleanSample } from './helpers';

describe('batches', () => {
  it('splits into fixed-size batches, last one shorter', () => {
    const items = Array.from({ length: 12_345 }, (_, i) => i);
    expect([...batches(items, 5_000)].map(b => b.length)).toEqual([5_000, 5_000, 2_345]);
  });
  it('keeps order and loses nothing', () => {
    const items = Array.from({ length: 11 }, (_, i) => i);
    expect([...batches(items, 4)].flat()).toEqual(items);
  });
  it('yields nothing for an empty list', () => {
    expect([...batches([], 10)]).toEqual([]);
  });
  it('defaults to BATCH_SIZE', () => {
    const sizes = [...batches(cleanSample('30d').checks)].map(b => b.length);
    expect(sizes).toEqual([BATCH_SIZE, BATCH_SIZE, 14_400 - 2 * BATCH_SIZE]);
  });
  it('rejects a size below 1', () => {
    expect(() => [...batches([1, 2], 0)]).toThrow('Batch size must be a positive integer');
  });
});
