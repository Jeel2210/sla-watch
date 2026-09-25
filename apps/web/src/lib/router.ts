// Two screens, no router library: /  (dashboard) and /uploads, with the viewed upload in ?upload=<id>.
// The URL is the state, so a link opens the same view (and Back works).
import { useSyncExternalStore } from 'react';

export type Screen = 'dashboard' | 'uploads';
export interface Route { screen: Screen; upload?: string }

const CHANGE = 'sla:navigate';

export function parseRoute(pathname: string, search: string): Route {
  const upload = new URLSearchParams(search).get('upload') ?? undefined;
  return { screen: pathname.replace(/\/+$/, '') === '/uploads' ? 'uploads' : 'dashboard', upload };
}

export function hrefFor(route: Route): string {
  const path = route.screen === 'uploads' ? '/uploads' : '/';
  return route.upload ? `${path}?upload=${encodeURIComponent(route.upload)}` : path;
}

export function navigate(route: Route, opts: { replace?: boolean } = {}) {
  const href = hrefFor(route);
  if (href === location.pathname + location.search) return;
  history[opts.replace ? 'replaceState' : 'pushState'](null, '', href);
  window.dispatchEvent(new Event(CHANGE));
  if (!opts.replace) window.scrollTo({ top: 0 });
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(CHANGE, onChange);
  };
}

const snapshot = () => location.pathname + location.search;

export function useRoute(): Route {
  const current = useSyncExternalStore(subscribe, snapshot);
  const [path, search = ''] = current.split('?');
  return parseRoute(path ?? '/', search ? `?${search}` : '');
}
