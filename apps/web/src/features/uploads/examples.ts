// "No file to hand? Try an example" — small CSVs built in the browser, same shape as the real exports.
import { REQUIRED_COLUMNS } from '@sla/core';

export type ExampleKind = 'valid' | 'bad-rows' | 'wrong-columns';

const SERVICES = [['svc-auth', 'auth-api'], ['svc-payments', 'payments-api']] as const;
const DAY_START = Date.UTC(2025, 5, 1);
const SLOT = 15 * 60_000;

/** Deterministic: the same example gives the same file (so a re-upload is recognised as a duplicate). */
function rows(): string[][] {
  const out: string[][] = [];
  for (let s = 0; s < 96; s++) {
    for (const [k, [id, name]] of SERVICES.entries()) {
      const failed = k === 1 && s >= 40 && s <= 42;            // a 45-minute payments outage
      out.push([id, name, new Date(DAY_START + s * SLOT).toISOString().replace('.000', ''), failed ? '503' : '200',
        String(80 + ((s * 37 + k * 11) % 90)), 'ms', `agent-${1 + (s % 2)}`, 'ap-south-1']);
    }
  }
  return out;
}

export function exampleFile(kind: ExampleKind): File {
  const header = [...REQUIRED_COLUMNS, 'region'].join(',');
  let lines = rows();
  if (kind === 'wrong-columns') {
    const text = ['service,time,code,latency_ms', ...lines.slice(0, 50).map(r => [r[0], r[2], r[3], r[4]].join(','))].join('\n');
    return new File([text], 'example_wrong_columns.csv', { type: 'text/csv' });
  }
  if (kind === 'bad-rows') {
    lines = lines.map((r, i) => (i % 47 === 5 ? [...r.slice(0, 2), '13/06/2025 16:00', ...r.slice(3)] : r));
    lines[100] = lines[100]!.slice(0, 5);
  }
  const name = kind === 'valid' ? 'example_valid.csv' : 'example_with_bad_rows.csv';
  return new File([[header, ...lines.map(r => r.join(','))].join('\n')], name, { type: 'text/csv' });
}
