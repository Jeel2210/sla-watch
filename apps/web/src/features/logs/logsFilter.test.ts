import { describe, expect, it } from 'vitest';
import { AGENT_MULTI } from '@sla/core';
import { applyPreset, chips, defaultFilters, presetOf, setDates, toQuery, unset, withWindow } from './logsFilter';

const u = { rangeStart: '2025-04-06T00:00:00.000Z', rangeEnd: '2025-05-05T23:45:00.000Z' };
const d = defaultFilters(u);
const win = { service: 'svc-auth', serviceName: 'auth-api', from: '2025-04-22T04:00:00.000Z', to: '2025-04-22T05:00:00.000Z', label: 'auth-api · 22 Apr, 04:00–05:00' };

describe('dates → query (UTC, `to` exclusive)', () => {
  it('whole upload by default', () => {
    expect(toQuery(d)).toEqual({ tab: 'all', sort: 'fail', from: '2025-04-06T00:00:00.000Z', to: '2025-05-06T00:00:00.000Z', service: undefined, agent: undefined, region: undefined });
  });
  it('single date = that whole day', () => {
    const q = toQuery({ ...d, mode: 'single', from: '2025-04-22', to: '2025-05-05' });
    expect([q.from, q.to]).toEqual(['2025-04-22T00:00:00.000Z', '2025-04-23T00:00:00.000Z']);
  });
  it('date range = first day 00:00 to the day after the last', () => {
    const q = toQuery({ ...d, from: '2025-04-06', to: '2025-04-12' });
    expect([q.from, q.to]).toEqual(['2025-04-06T00:00:00.000Z', '2025-04-13T00:00:00.000Z']);
  });
  it('a chart window replaces dates and service', () => {
    expect(toQuery(withWindow({ ...d, service: 'svc-x' }, win))).toMatchObject({ service: 'svc-auth', from: win.from, to: win.to, sort: 'old', tab: 'all' });
  });
  it('agent and region pass through; 2+ agents uses the shared constant', () => {
    expect(toQuery({ ...d, agent: AGENT_MULTI, region: 'eu-west-1' })).toMatchObject({ agent: '*', region: 'eu-west-1' });
  });
});

describe('presets are relative to the upload, not today', () => {
  it('All / Last day / Last 7 days', () => {
    expect(presetOf(d, u)).toBe('all');
    const last1 = applyPreset(d, 'last1', u);
    expect(last1).toMatchObject({ mode: 'single', from: '2025-05-05' });
    expect(presetOf(last1, u)).toBe('last1');
    const last7 = applyPreset(d, 'last7', u);
    expect(last7).toMatchObject({ mode: 'range', from: '2025-04-29', to: '2025-05-05' });
    expect(presetOf(last7, u)).toBe('last7');
  });
  it('last 7 days of a 5-day upload is the whole upload', () => {
    const short = { rangeStart: '2025-01-01T00:00:00Z', rangeEnd: '2025-01-05T23:45:00Z' };
    expect(applyPreset(defaultFilters(short), 'last7', short)).toMatchObject({ from: '2025-01-01' });
  });
  it('custom dates match no preset; a window matches none', () => {
    expect(presetOf({ ...d, from: '2025-04-10' }, u)).toBeNull();
    expect(presetOf(withWindow(d, win), u)).toBeNull();
  });
});

describe('setDates keeps dates valid', () => {
  it('clamps to the upload and swaps a reversed range', () => {
    expect(setDates(d, '2024-01-01', '2030-01-01', u)).toMatchObject({ from: '2025-04-06', to: '2025-05-05' });
    expect(setDates(d, '2025-04-20', '2025-04-10', u)).toMatchObject({ from: '2025-04-10', to: '2025-04-20' });
    expect(setDates(withWindow(d, win), '2025-04-10', '2025-04-11', u).window).toBeNull();
  });
});

describe('chips', () => {
  const names = { 'svc-auth': 'auth-api' };
  it('none by default', () => expect(chips(d, u, names)).toEqual([]));
  it('one per active filter, in words', () => {
    const f = { ...d, from: '2025-04-10', to: '2025-04-12', service: 'svc-auth', agent: AGENT_MULTI, sort: 'new' as const };
    expect(chips(f, u, names).map(c => c.label)).toEqual(['10 Apr – 12 Apr', 'auth-api', 'Reported by 2+ agents', 'Newest first']);
    expect(chips({ ...d, mode: 'single', from: '2025-04-22' }, u, names).map(c => c.label)).toEqual(['22 Apr']);
  });
  it('a window shows its own label (and not a separate service chip)', () => {
    expect(chips(withWindow(d, win), u, names).map(c => c.key)).toEqual(['window', 'sort']);
  });
  it('removing a chip resets only that filter; Clear all keeps the tab', () => {
    const f = { ...d, tab: 'failed' as const, service: 'svc-auth', region: 'x', from: '2025-04-10' };
    expect(unset(f, 'region', u)).toMatchObject({ region: '', service: 'svc-auth', from: '2025-04-10' });
    expect(unset(f, 'date', u)).toMatchObject({ from: '2025-04-06', service: 'svc-auth' });
    expect(unset(withWindow(f, win), 'window', u)).toMatchObject({ window: null, service: '' });
    expect(unset(f, 'all', u)).toEqual({ ...d, tab: 'failed' });
  });
});
