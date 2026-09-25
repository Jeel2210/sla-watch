import { describe, expect, it } from 'vitest';
import { cleanCsv, MAX_LINE_CHARS, type CleanOk } from '../src/index';

const H = 'service_id,service_name,timestamp,status_code,latency,latency_unit,agent,region';
const ok = (text: string): CleanOk => {
  const r = cleanCsv(text);
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.message}`);
  return r;
};
// two services × three 15-minute slots
const BASE = [H,
  'svc-a,a-api,2025-04-06T00:00:00Z,200,100,ms,agent-1,ap-south-1',
  'svc-a,a-api,2025-04-06T00:15:00Z,200,110,ms,agent-1,ap-south-1',
  'svc-a,a-api,2025-04-06T00:30:00Z,503,120,ms,agent-1,ap-south-1',
  'svc-b,b-api,2025-04-06T00:00:00Z,200,0.2,s,agent-1,ap-south-1',
  'svc-b,b-api,2025-04-06T00:15:00Z,200,0.3,s,agent-1,ap-south-1',
  'svc-b,b-api,2025-04-06T00:30:00Z,200,0.4,s,agent-1,ap-south-1'];

describe('cleanCsv', () => {
  it('detects interval, range and coverage from the data', () => {
    const r = ok(BASE.join('\r\n'));
    expect(r.intervalMin).toBe(15);
    expect(r.rangeStart).toBe(Date.UTC(2025, 3, 6, 0, 0));
    expect(r.rangeEnd).toBe(Date.UTC(2025, 3, 6, 0, 30));
    expect(r.expectedChecks).toBe(6);
    expect(r.checks).toHaveLength(6);
    expect(r.gaps).toBe(0);
    expect(r.services).toEqual([{ id: 'svc-a', name: 'a-api' }, { id: 'svc-b', name: 'b-api' }]);
    expect(r.issues.unitConverted).toEqual({ s: 3 });
    expect(r.checks.filter(c => c.isFailed)).toHaveLength(1);
  });
  it('merges duplicate reports; a failure wins; agents are kept', () => {
    const r = ok([...BASE, 'svc-a,a-api,2025-04-06T00:15:00Z,502,130,ms,agent-2,ap-south-1'].join('\n'));
    const c = r.checks.find(x => x.serviceId === 'svc-a' && x.slot === Date.UTC(2025, 3, 6, 0, 15))!;
    expect(c.status).toBe(502);
    expect(c.isFailed).toBe(true);
    expect(c.agents).toEqual(['agent-1', 'agent-2']);
    expect(c.flags).toContain('merged');
    expect(r.issues.mergedRows).toBe(1);
  });
  it('drops exact duplicate lines and merges the same check written in another format', () => {
    const r = ok([...BASE, BASE[1]!, 'svc-a,a-api,2025-04-06T05:30:00+05:30,200,100,ms,agent-1,ap-south-1'].join('\n'));
    expect(r.issues.exactDuplicates).toBe(1);
    expect(r.issues.offset).toBe(1);
    expect(r.checks).toHaveLength(6);
  });
  it('uses a valid status from another agent instead of 999', () => {
    const r = ok([...BASE, 'svc-b,b-api,2025-04-06T00:30:00Z,999,0.4,s,agent-2,ap-south-1'].join('\n'));
    const c = r.checks.find(x => x.serviceId === 'svc-b' && x.slot === Date.UTC(2025, 3, 6, 0, 30))!;
    expect(c.status).toBe(200);
    expect(c.isValid).toBe(true);
    expect(c.flags).not.toContain('invalid_status');
  });
  it('snaps an off-grid timestamp to the nearest slot and flags it', () => {
    const r = ok([...BASE.slice(0, 2), 'svc-a,a-api,2025-04-06T00:16:10Z,200,110,ms,agent-1,ap-south-1', ...BASE.slice(3)].join('\n'));
    expect(r.issues.snapped).toBe(1);
    expect(r.checks.find(x => x.serviceId === 'svc-a' && x.flags.includes('snapped'))?.slot).toBe(Date.UTC(2025, 3, 6, 0, 15));
  });
  it('counts a missing slot as a gap, not a check', () => {
    const r = ok(BASE.filter((_, i) => i !== 2).join('\n'));
    expect(r.checks).toHaveLength(5);
    expect(r.gaps).toBe(1);
  });
  it('rejects unreadable rows but keeps the rest', () => {
    const r = ok([...BASE, 'svc-a,a-api,13/05/2025 16:00,200,12,ms,agent-1,ap-south-1'].join('\n'));
    expect(r.rejected).toEqual([{ line: 8, raw: 'svc-a,a-api,13/05/2025 16:00,200,12,ms,agent-1,ap-south-1', reason: 'Unrecognised timestamp "13/05/2025 16:00"' }]);
    expect(r.checks).toHaveLength(6);
  });
  it('counts 4xx as up', () => {
    const r = ok([...BASE.slice(0, 1), 'svc-a,a-api,2025-04-06T00:00:00Z,429,100,ms,agent-1,ap-south-1', ...BASE.slice(2)].join('\n'));
    expect(r.issues.status4xx).toBe(1);
    expect(r.checks.find(x => x.status === 429)?.isFailed).toBe(false);
  });
  it('strips a UTF-8 BOM', () => {
    expect(ok('﻿' + BASE.join('\n')).checks).toHaveLength(6);
  });
  it('maps columns by name, case-insensitive, ignores extras', () => {
    const text = ['NOTES,Agent,Latency_Unit,Latency,Status_Code,Timestamp,Service_Name,Service_ID',
      'x,agent-1,ms,100,200,2025-04-06T00:00:00Z,a-api,svc-a',
      'y,agent-1,ms,110,200,2025-04-06T00:15:00Z,a-api,svc-a'].join('\n');
    const r = ok(text);
    expect(r.checks).toHaveLength(2);
    expect(r.checks[0]!.region).toBeNull();
  });
  it('EMPTY: header only', () => {
    expect(cleanCsv(H + '\n\n')).toMatchObject({ ok: false, code: 'EMPTY' });
  });
  it('MISSING_COLUMNS: lists what is missing and what was found', () => {
    expect(cleanCsv('service,time,code\nsvc-a,2025-04-06T00:00:00Z,200')).toMatchObject({
      ok: false, code: 'MISSING_COLUMNS',
      missing: ['service_id', 'service_name', 'timestamp', 'status_code', 'latency', 'latency_unit', 'agent'],
      found: ['service', 'time', 'code'],
    });
  });
  it('NO_READABLE_ROWS: every row rejected', () => {
    const r = cleanCsv([H, 'svc-a,a-api,yesterday,200,1,ms,agent-1,x'].join('\n'));
    expect(r).toMatchObject({ ok: false, code: 'NO_READABLE_ROWS' });
    expect(!r.ok && r.rejected).toHaveLength(1);
  });
  it('rejects a line over MAX_LINE_CHARS without parsing it', () => {
    const long = 'svc-a,a-api,2025-04-06T01:30:00Z,200,12,ms,agent-1,' + 'x'.repeat(MAX_LINE_CHARS);
    const r = ok([...BASE, long].join('\n'));
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]!.reason).toBe(`Line is longer than ${MAX_LINE_CHARS} characters`);
    expect(r.rejected[0]!.raw.length).toBeLessThanOrEqual(200);
  });
  it('TOO_MANY_ROWS: more data rows than the limit', () => {
    expect(cleanCsv(BASE.join('\n'), { maxRows: 3 })).toMatchObject({ ok: false, code: 'TOO_MANY_ROWS' });
  });
});
