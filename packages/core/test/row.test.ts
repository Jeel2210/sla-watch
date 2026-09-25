import { describe, expect, it } from 'vitest';
import { parseRow, splitCsvLine } from '../src/index';

const HEADER = 'service_id,service_name,timestamp,status_code,latency,latency_unit,agent,region'.split(',');
const COL = Object.fromEntries(HEADER.map((h, i) => [h, i]));
const row = (line: string) => parseRow(splitCsvLine(line), COL, HEADER.length);

describe('parseRow', () => {
  it('reads a clean row', () => {
    const r = row('svc-a,a-api,2025-04-06T00:15:00Z,200,110,ms,agent-1,ap-south-1');
    expect(r).toEqual({ ok: true, row: {
      serviceId: 'svc-a', serviceName: 'a-api', ms: Date.UTC(2025, 3, 6, 0, 15), tsKind: 'iso_utc', tsOffset: null,
      status: 200, statusValid: true, latencyMs: 110, latencyIssue: null, unit: 'ms', unitCaseFixed: false,
      agent: 'agent-1', region: 'ap-south-1', trimmed: false } });
  });
  it('converts seconds and reads units case-insensitively', () => {
    const r = row('svc-a,a-api,2025-04-06T00:15:00Z,200,0.486,S,agent-1,ap-south-1');
    expect(r.ok && r.row.latencyMs).toBe(486);
    expect(r.ok && r.row.unit).toBe('s');
    expect(r.ok && r.row.unitCaseFixed).toBe(true);
  });
  it('keeps the check when latency is blank or negative', () => {
    const blank = row('svc-a,a-api,2025-04-06T00:15:00Z,503,,ms,agent-1,ap-south-1');
    expect(blank.ok && [blank.row.latencyMs, blank.row.latencyIssue]).toEqual([null, 'missing']);
    const neg = row('svc-a,a-api,2025-04-06T00:15:00Z,200,-286,ms,agent-1,ap-south-1');
    expect(neg.ok && [neg.row.latencyMs, neg.row.latencyIssue]).toEqual([null, 'negative']);
  });
  it('marks 999 as an invalid status but keeps the row', () => {
    const r = row('svc-a,a-api,2025-04-06T00:15:00Z,999,120,ms,agent-1,ap-south-1');
    expect(r.ok && r.row.statusValid).toBe(false);
  });
  it('trims padded fields and records it', () => {
    const r = row(' svc-a , a-api ,2025-04-06T00:15:00Z,200,12,ms,agent-1,ap-south-1');
    expect(r.ok && [r.row.serviceId, r.row.serviceName, r.row.trimmed]).toEqual(['svc-a', 'a-api', true]);
  });
  it('rejects unreadable rows with a reason', () => {
    expect(row('svc-a,a-api,13/05/2025 16:00,200,12,ms,agent-1,ap-south-1'))
      .toEqual({ ok: false, reason: 'Unrecognised timestamp "13/05/2025 16:00"' });
    expect(row('svc-a,a-api,2025-04-06T00:15:00Z,200,12,sec,agent-1,ap-south-1'))
      .toEqual({ ok: false, reason: 'Unknown latency unit "sec"' });
    expect(row('svc-a,a-api,2025-04-06T00:15:00Z,200'))
      .toEqual({ ok: false, reason: 'Only 4 of 8 columns' });
    expect(row(',a-api,2025-04-06T00:15:00Z,200,12,ms,agent-1,ap-south-1'))
      .toEqual({ ok: false, reason: 'Empty service_id' });
  });
  it('rejects over-long fields instead of truncating them', () => {
    expect(row(`${'s'.repeat(201)},a-api,2025-04-06T00:15:00Z,200,12,ms,agent-1,ap-south-1`))
      .toEqual({ ok: false, reason: 'service_id is longer than 200 characters' });
    expect(row(`svc-a,a-api,2025-04-06T00:15:00Z,200,12,ms,${'a'.repeat(101)},ap-south-1`))
      .toEqual({ ok: false, reason: 'agent is longer than 100 characters' });
    expect(row(`svc-a,${'n'.repeat(200)},2025-04-06T00:15:00Z,200,12,ms,agent-1,${'r'.repeat(100)}`).ok).toBe(true);
  });
});
