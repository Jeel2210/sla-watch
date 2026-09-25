import { describe, expect, it } from 'vitest';
import { allowanceText, fmtDay, fmtDayYear, fmtMin, fmtMs, fmtPct, fmtRange, fmtStamp, fmtWhen, nf, plural } from './format';

describe('format', () => {
  it('numbers', () => {
    expect(nf(14400)).toBe('14,400');
    expect(fmtPct(97.152777)).toBe('97.15%');
    expect(fmtPct(null)).toBe('—');
    expect(fmtMs(653.6)).toBe('654 ms');
    expect(plural(1, 'check')).toBe('1 check');
    expect(plural(1177, 'row')).toBe('1,177 rows');
  });
  it('minutes', () => {
    expect(fmtMin(43.199999999997)).toBe('43.2 min');
    expect(fmtMin(135)).toBe('2 h 15 min');
    expect(fmtMin(120)).toBe('2 h');
    expect(fmtMin(1230)).toBe('20 h 30 min');
  });
  it('dates are UTC whatever the viewer’s time zone', () => {
    const t = '2025-04-22T04:15:00.000Z';
    expect(fmtDay(t)).toBe('22 Apr');
    expect(fmtDayYear(t)).toBe('22 Apr 2025');
    expect(fmtWhen(t)).toBe('22 Apr, 04:15');
    expect(fmtStamp(t)).toBe('2025-04-22 04:15');
    expect(fmtRange('2025-04-06T00:00:00Z', '2025-05-05T23:45:00Z')).toBe('6 Apr – 5 May 2025');
    expect(fmtRange('2024-12-28T00:00:00Z', '2025-01-03T00:00:00Z')).toBe('28 Dec 2024 – 3 Jan 2025');
  });
  it('allowance wording', () => {
    expect(allowanceText(true, 0.4)).toBe('within allowance');
    expect(allowanceText(false, 1.3)).toBe('over allowance');
    expect(allowanceText(false, 28.47)).toBe('28× allowance');
  });
});
