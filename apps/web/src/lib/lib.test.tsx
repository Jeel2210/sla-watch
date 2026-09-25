import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCursorPager, useStored } from './hooks';
import { hrefFor, navigate, parseRoute, useRoute } from './router';

describe('router', () => {
  it('parses and builds the two screens with the viewed upload', () => {
    expect(parseRoute('/', '')).toEqual({ screen: 'dashboard', upload: undefined });
    expect(parseRoute('/uploads/', '?upload=abc')).toEqual({ screen: 'uploads', upload: 'abc' });
    expect(hrefFor({ screen: 'dashboard', upload: 'a b' })).toBe('/?upload=a%20b');
    expect(hrefFor({ screen: 'uploads' })).toBe('/uploads');
  });
  it('navigate updates every useRoute', () => {
    const { result } = renderHook(() => useRoute());
    act(() => navigate({ screen: 'uploads', upload: 'u1' }));
    expect(result.current).toEqual({ screen: 'uploads', upload: 'u1' });
    act(() => navigate({ screen: 'dashboard' }));
    expect(result.current.screen).toBe('dashboard');
  });
});

describe('useCursorPager', () => {
  it('pages forward and back, and restarts when the filters change', () => {
    const { result, rerender } = renderHook(({ k }) => useCursorPager(k), { initialProps: { k: 'a' } });
    expect(result.current).toMatchObject({ cursor: undefined, page: 0 });
    act(() => result.current.next('c1'));
    act(() => result.current.next('c2'));
    expect(result.current).toMatchObject({ cursor: 'c2', page: 2 });
    act(() => result.current.prev());
    expect(result.current).toMatchObject({ cursor: 'c1', page: 1 });
    rerender({ k: 'b' });
    expect(result.current).toMatchObject({ cursor: undefined, page: 0 });
  });
});

describe('useStored', () => {
  it('remembers allowed values and ignores anything else', () => {
    localStorage.setItem('t-view', 'bogus');
    const { result } = renderHook(() => useStored('t-view', ['hex', 'timeline'] as const, 'hex'));
    expect(result.current[0]).toBe('hex');
    act(() => result.current[1]('timeline'));
    expect(result.current[0]).toBe('timeline');
    expect(localStorage.getItem('t-view')).toBe('timeline');
  });
});
