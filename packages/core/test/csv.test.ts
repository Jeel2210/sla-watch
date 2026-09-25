import { describe, expect, it } from 'vitest';
import { splitCsvLine } from '../src/index';

describe('splitCsvLine', () => {
  it('splits a plain line', () => {
    expect(splitCsvLine('svc-a,a-api,2025-04-06T00:00:00Z,200,12,ms,agent-1,ap-south-1'))
      .toEqual(['svc-a', 'a-api', '2025-04-06T00:00:00Z', '200', '12', 'ms', 'agent-1', 'ap-south-1']);
  });
  it('keeps empty fields', () => {
    expect(splitCsvLine('a,,c,')).toEqual(['a', '', 'c', '']);
  });
  it('keeps commas inside quotes', () => {
    expect(splitCsvLine('svc-a,"payments, eu",x')).toEqual(['svc-a', 'payments, eu', 'x']);
  });
  it('unescapes doubled quotes', () => {
    expect(splitCsvLine('"say ""hi""",b')).toEqual(['say "hi"', 'b']);
  });
});
