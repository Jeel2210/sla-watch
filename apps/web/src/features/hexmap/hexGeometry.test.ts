import { describe, expect, it } from 'vitest';
import type { HexDay } from '@sla/core';
import { daysPerPage, fitRadius, hexFrame, hexGeometry } from './hexGeometry';

const day = (d: string, failedAt: Record<number, number> = {}, incidentHours: number[] = []): HexDay => ({
  day: d,
  hours: Array.from({ length: 24 }, (_, h) => ({ checks: 4, failed: failedAt[h] ?? 0, incident: incidentHours.includes(h) })),
});

describe('hexFrame / paging', () => {
  it('hexagons fill the width within readable limits', () => {
    expect(hexFrame(2000).r).toBe(17);          // capped
    expect(hexFrame(300).r).toBe(6);            // floor
    expect(hexFrame(900).narrow).toBe(false);
    expect(hexFrame(500).narrow).toBe(true);
  });
  it('days per page follow the height; phones get a week', () => {
    expect(daysPerPage(500, 2000)).toBe(7);
    const tall = daysPerPage(1100, 900);
    const short = daysPerPage(1100, 500);
    expect(tall).toBeGreaterThan(short);
    expect(short).toBeGreaterThanOrEqual(4);
  });
  it('full view radius fits every day into the height', () => {
    const r = fitRadius(1400, 700, 60);
    expect((60 + 0.5) * Math.sqrt(3) * r + 24 + 56).toBeLessThanOrEqual(700.01);
  });
  it('never smaller than readable (r = 4): very long uploads scroll in full view instead', () => {
    expect(fitRadius(1400, 700, 90)).toBe(4);
  });
});

describe('hexGeometry', () => {
  const days = [day('2025-04-22', { 4: 4, 5: 4, 6: 3, 10: 1 }, [4, 5, 6, 7, 8, 9, 10]), day('2025-04-23', { 5: 2 })];
  const g = hexGeometry(days, 1100);

  it('one hexagon per hour per day, with heat 0/1/2/3+', () => {
    expect(g.cells).toHaveLength(48);
    const at = (d: string, h: number) => g.cells.find(c => c.day === d && c.hour === h)!;
    expect(at('2025-04-22', 4)).toMatchObject({ failed: 4, heat: 3, incident: true });
    expect(at('2025-04-22', 10)).toMatchObject({ heat: 1, incident: true });
    expect(at('2025-04-23', 5)).toMatchObject({ heat: 2, incident: false });
    expect(at('2025-04-23', 0).heat).toBe(0);
  });
  it('per-day and per-hour totals; the peak hour is marked', () => {
    expect(g.dayBars.map(b => b.n)).toEqual([12, 2]);
    expect(g.hourBars[5]).toMatchObject({ n: 6, peak: true });
    expect(g.hourBars.filter(b => b.peak)).toHaveLength(1);
  });
  it('labels days on the left (UTC) and hours on top', () => {
    expect(g.rowLabels.map(l => l.text)).toEqual(['22 Apr', '23 Apr']);
    expect(g.colLabels[0]!.text).toBe('00:00');
  });
  it('everything fits inside the width', () => {
    for (const c of g.cells) expect(c.path).toMatch(/^M/);
    for (const b of g.dayBars) expect(b.x + b.w).toBeLessThanOrEqual(g.width);
  });
});
