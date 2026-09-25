import { describe, expect, it } from 'vitest';
import { parseTimestamp } from '../src/index';

const UTC = Date.UTC(2025, 3, 6, 0, 15); // 2025-04-06T00:15:00Z

describe('parseTimestamp', () => {
  it('reads ISO UTC', () => {
    expect(parseTimestamp('2025-04-06T00:15:00Z')).toEqual({ ms: UTC, kind: 'iso_utc', offset: null });
  });
  it('converts a +05:30 offset to UTC', () => {
    expect(parseTimestamp('2025-04-06T05:45:00+05:30')).toEqual({ ms: UTC, kind: 'iso_offset', offset: '+05:30' });
  });
  it('reads epoch seconds and milliseconds', () => {
    expect(parseTimestamp(String(UTC / 1000))).toEqual({ ms: UTC, kind: 'epoch', offset: null });
    expect(parseTimestamp(String(UTC))).toEqual({ ms: UTC, kind: 'epoch', offset: null });
  });
  it('accepts minutes-only and milliseconds', () => {
    expect(parseTimestamp('2025-04-06T00:15Z')?.ms).toBe(UTC);
    expect(parseTimestamp('2025-04-06T05:45:00.000+05:30')?.ms).toBe(UTC);
  });
  it('trims surrounding spaces', () => {
    expect(parseTimestamp('  2025-04-06T00:15:00Z ')?.ms).toBe(UTC);
  });
  it('rejects anything else', () => {
    for (const bad of ['13/05/2025 16:00', '2025-04-06 00:15:00', '2025-04-06T00:15:00', '12345', '', 'tomorrow']) {
      expect(parseTimestamp(bad)).toBeNull();
    }
  });
});
