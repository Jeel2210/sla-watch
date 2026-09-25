// UI constants (RULES.md → no magic numbers). Business constants live in @sla/core.

/** Services loaded per scroll step in the service list. */
export const SVC_PAGE = 5;
/** Log rows per page. */
export const LOG_PAGE = 10;
/** Rows per page in the All uploads table. */
export const UPLOAD_PAGE = 10;
/** Uploads shown in the sidebar (plus the one being viewed, if older). */
export const SIDE_RECENT = 6;
/** Timeline: bins per service row and services per page. */
export const TL_BINS = 240;
export const TL_PAGE = 10;
/** Search boxes wait this long after the last key before asking the server. */
export const SEARCH_DEBOUNCE_MS = 300;
/** Uploads are immutable, so server data stays fresh for a long time (ARCHITECTURE.md → Frontend caching). */
export const STALE_MS = 5 * 60_000;
/** Page size when loading every service name for the logs' Service filter (the API's maximum). */
export const SERVICE_OPTIONS_PAGE = 20;
/**
 * Upload lists, unlike an upload's own data, change: someone else (or another tab) can add an upload.
 * They count as out of date after this long and refresh when the tab is focused again.
 */
export const UPLOADS_STALE_MS = 30_000;
