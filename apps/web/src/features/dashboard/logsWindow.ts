// A chart click (hexagon, timeline bin, incident) opens exactly those checks in the logs.
export interface LogsWindow {
  service: string;
  serviceName: string;
  from: string;       // ISO, inclusive
  to: string;         // ISO, exclusive
  label: string;      // shown as the filter chip, e.g. "auth-api · 22 Apr, 04:00–05:00"
}

export type OpenLogs = (w: LogsWindow) => void;
