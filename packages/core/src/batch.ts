import { BATCH_SIZE } from './constants';

/** Consecutive slices of at most `size` items — used to write large uploads in bounded chunks. */
export function* batches<T>(items: readonly T[], size: number = BATCH_SIZE): Generator<T[]> {
  if (!Number.isInteger(size) || size < 1) throw new Error('Batch size must be a positive integer');
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}
