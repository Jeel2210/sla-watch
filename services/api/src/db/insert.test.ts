import { describe, expect, it } from 'vitest';
import type { Db } from './client';
import { insertRows, pgTextArray } from './insert';

function recorder() {
  const calls: { text: string; values: unknown[] }[] = [];
  const db = { query: async (text: string, values: unknown[] = []) => { calls.push({ text, values }); return { rows: [] }; } } as unknown as Db;
  return { db, calls };
}
const rows = (n: number, cols: number) => Array.from({ length: n }, (_, r) => Array.from({ length: cols }, (_, c) => r * cols + c));

describe('insertRows', () => {
  it('writes one parameterised multi-row insert', async () => {
    const { db, calls } = recorder();
    await insertRows(db, 'services', ['upload_id', 'service_id', 'service_name'], [['u', 'a', 'A'], ['u', 'b', 'B']], r => r);
    expect(calls).toEqual([{ text: 'insert into services (upload_id, service_id, service_name) values ($1, $2, $3), ($4, $5, $6)', values: ['u', 'a', 'A', 'u', 'b', 'B'] }]);
  });
  it('splits into batches of 5,000 rows when columns allow', async () => {
    const { db, calls } = recorder();
    await insertRows(db, 't', ['a', 'b', 'c'], rows(12_001, 3), r => r);
    expect(calls.map(c => c.values.length / 3)).toEqual([5000, 5000, 2001]);
  });
  it('uses smaller batches when columns × rows would pass 32,767 parameters', async () => {
    const { db, calls } = recorder();
    await insertRows(db, 't', Array.from({ length: 20 }, (_, i) => `c${i}`), rows(7_000, 20), r => r);
    expect(calls.map(c => c.values.length / 20)).toEqual([1638, 1638, 1638, 1638, 448]);
    expect(calls.every(c => c.values.length <= 32_767)).toBe(true);
  });
  it('builds each batch’s rows only when that batch is written (memory stays flat on big uploads)', async () => {
    let built = 0;
    const seen: number[] = [];
    const db = { query: async () => { seen.push(built); return { rows: [] }; } } as unknown as Db;
    await insertRows(db, 't', ['a', 'b', 'c'], Array.from({ length: 12_001 }, (_, i) => i), i => { built++; return [i, i, i]; });
    expect(seen).toEqual([5000, 10_000, 12_001]);
  });
  it('does nothing for no rows', async () => {
    const { db, calls } = recorder();
    await insertRows(db, 't', ['a'], [], r => [r]);
    expect(calls).toEqual([]);
  });
});

describe('pgTextArray', () => {
  it('quotes and escapes every element', () => {
    expect(pgTextArray(['agent-1', 'a,b', 'q"t', 'b\\s', ''])).toBe('{"agent-1","a,b","q\\"t","b\\\\s",""}');
    expect(pgTextArray([])).toBe('{}');
  });
});
