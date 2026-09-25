// Small reusable React hooks (no data fetching here — that is api/hooks.ts).
import { useEffect, useState } from 'react';

/** The value, once it has stopped changing for `ms` (search boxes ask the server only then). */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Previous/Next paging over cursor-paged lists. Cursors only go forward, so the pages seen so far are kept
 * as a stack. Paging starts again from page 1 whenever `resetKey` changes (new filters, new upload).
 */
export function useCursorPager(resetKey: string) {
  const [state, setState] = useState<{ key: string; stack: (string | undefined)[] }>({ key: resetKey, stack: [undefined] });
  const stack = state.key === resetKey ? state.stack : [undefined];
  if (state.key !== resetKey) setState({ key: resetKey, stack });
  return {
    cursor: stack[stack.length - 1],
    page: stack.length - 1,
    next: (cursor: string) => setState({ key: resetKey, stack: [...stack, cursor] }),
    prev: () => setState({ key: resetKey, stack: stack.length > 1 ? stack.slice(0, -1) : stack }),
  };
}

/** A value kept in localStorage (per-viewer conveniences only; works without storage). */
export function useStored<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = localStorage.getItem(key);
      return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
    } catch {
      return fallback;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try { localStorage.setItem(key, v); } catch { /* storage blocked: keep it in memory */ }
  };
  return [value, set];
}
