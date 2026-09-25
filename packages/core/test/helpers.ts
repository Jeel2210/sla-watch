import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanCsv, type CleanOk } from '../src/index';

const DATA = new URL('../../../data/', import.meta.url);
const path = (rel: string) => fileURLToPath(new URL(rel, DATA));

export const SAMPLE_FILES = {
  '9d': 'monitoring_checks_9d_seed101.csv',
  '12d': 'monitoring_checks_12d_seed505.csv',
  '14d': 'monitoring_checks_14d_seed202.csv',
  '21d': 'monitoring_checks_21d_seed303.csv',
  '30d': 'monitoring_checks_30d_seed404.csv',
} as const;
export type SampleKey = keyof typeof SAMPLE_FILES;

export const readSample = (name: string) => readFileSync(path(`samples/${name}`), 'utf8');
export const readStress = (name: string) => readFileSync(path(`stress/${name}`), 'utf8');
export const hasStress = (name: string) => existsSync(path(`stress/${name}`));

const cache = new Map<SampleKey, CleanOk>();
export function cleanSample(key: SampleKey): CleanOk {
  const hit = cache.get(key);
  if (hit) return hit;
  const r = cleanCsv(readSample(SAMPLE_FILES[key]));
  if (!r.ok) throw new Error(`${key}: ${r.message}`);
  cache.set(key, r);
  return r;
}
