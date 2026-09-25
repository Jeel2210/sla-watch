// Test-only: a real Postgres (PGlite, in-process) with every migration applied, so SQL is tested for real.
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { Db } from '../db/client';

const MIGRATIONS = new URL('../db/migrations/', import.meta.url);

export interface TestDb { db: Db; transaction: <T>(fn: (tx: Db) => Promise<T>) => Promise<T>; close: () => Promise<void> }

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  for (const file of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) {
    await pg.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  }
  const asDb = (q: Pick<PGlite, 'query'>): Db => ({ query: (text, values) => q.query(text, values) as never });
  return {
    db: asDb(pg),
    transaction: fn => pg.transaction(tx => fn(asDb(tx))),
    close: () => pg.close(),
  };
}
