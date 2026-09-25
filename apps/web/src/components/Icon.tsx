// The app's icons (from the approved mockup), drawn with currentColor so they follow the text colour.
const PATHS = {
  dashboard: <><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></>,
  upload: <path d="M8 10.5V2.5M5 5.5l3-3 3 3M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />,
  report: <><path d="M3.5 1.5h6l3 3v10h-9z" /><path d="M5.5 8h5M5.5 11h5" /></>,
  search: <><circle cx="7" cy="7" r="4.6" /><path d="M10.6 10.6L14 14" /></>,
  filter: <path d="M2 3h12L9.5 8.5v4.5l-3-1.5V8.5z" />,
  hex: <path d="M8 1.5l5.5 3.2v6.6L8 14.5l-5.5-3.2V4.7z" />,
  timeline: <><path d="M2 4.5h12M2 8h12M2 11.5h12" opacity=".45" /><path d="M4.5 3v3M9.5 6.5v3M7 10v3M12.5 3v3" /></>,
  incident: <><path d="M8 2l6.4 11.3H1.6z" /><path d="M8 6.4v3.2M8 11.4h.01" /></>,
  expand: <path d="M9.5 2h4.5v4.5M6.5 14H2V9.5M14 2L9 7M2 14l5-5" />,
  close: <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />,
  chevron: <path d="M4 6l4 4 4-4" />,
  chart: <><path d="M3 13l3.5-3.5 2.5 2.5 4-5 2.5 2.5" /><path d="M2 15h13" /></>,
  file: <><path d="M4 1.5h5.5l3 3v10H4z" /><path d="M9 1.5v3.5h3.5" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {PATHS[name]}
    </svg>
  );
}

/** The brand mark: a pulse line in a dark tile. */
export function BrandMark() {
  return (
    <span className="mark" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 14 14"><path d="M1 8h3l2-5 2 8 2-4h3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}
