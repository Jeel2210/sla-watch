// Thin bar at the top while server data loads (DESIGN.md → UX states: Loading).
import { useIsFetching } from '@tanstack/react-query';

export function TopProgress() {
  const busy = useIsFetching() > 0;
  return <div className={`topprog${busy ? ' on' : ''}`} aria-hidden="true" />;
}
