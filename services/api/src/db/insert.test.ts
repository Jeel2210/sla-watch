import { describe, expect, it } from 'vitest';
import type { Db } from './client';
import { insertRows } from './insert';

function recorder() {
  const calls: { text: string; values: unknown[] }[] = [];
  const db = { query: async (text: string, values: unknown[] = []) => { calls.push({ text, values }); return { rows: [] }; } } as unknown as Db;
  return { db, calls };
}
const rows = (n: number, cols: number) => Array.from({ length: n }, (_, r) => Array.from({ length: cols }, (_, c) => r * cols + c));

describe('insertRows', () => {
  it('writes one parameterised multi-row insert', async () => {
    const { db, calls } = recorder();
    await insertRows(db, 'services', ['upload_id', 'service_id', 'service_name'], [['u', 'a', 'A'], ['u', 'b', 'B']]);
    expect(calls).toEqual([{ text: 'insert into services (upload_id, service_id, service_name) values ($1, $2, $3), ($4, $5, $6)', values: ['u', 'a', 'A', 'u', 'b', 'B'] }]);
  });
  it('splits into batches of 5,000 rows', async () => {
    const { db, calls } = recorder();
    await insertRows(db, 't', ['a', 'b', 'c'], rows(12_001, 3));
    expect(calls.map(c => c.values.length / 3)).toEqual([5000, 5000, 2001]);
  });
  it('uses smaller batches when columns × rows would pass 65,535 parameters', async () => {
    const { db, calls } = recorder();
    await insertRows(db, 't', Array.from({ length: 20 }, (_, i) => `c${i}`), rows(7_000, 20));
    expect(calls.map(c => c.values.length / 20)).toEqual([3276, 3276, 448]);
    expect(calls.every(c => c.values.length <= 65_535)).toBe(true);
  });
  it('does nothing for no rows', async () => {
    const { db, calls } = recorder();
    await insertRows(db, 't', ['a'], []);
    expect(calls).toEqual([]);
  });
});
