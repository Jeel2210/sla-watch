// Which upload the app is showing: the one in the URL, else the newest. Uploads are never mixed (S7).
import type { UploadSummary } from '@sla/core';
import { useUpload, useUploadsPage } from '../../api/hooks';
import { SIDE_RECENT } from '../../lib/constants';
import { useRoute } from '../../lib/router';

export interface CurrentUpload {
  /** Newest uploads for the sidebar (loading: undefined). */
  recent: UploadSummary[] | undefined;
  /** The id being viewed; undefined when there are no uploads (or still loading). */
  id: string | undefined;
  /** Summary of the viewed upload, once known. */
  upload: UploadSummary | undefined;
  loading: boolean;
  error: unknown;
  /** No uploads stored at all. */
  empty: boolean;
}

export function useCurrentUpload(): CurrentUpload {
  const route = useRoute();
  const recent = useUploadsPage({ limit: SIDE_RECENT });
  const items = recent.data?.items;
  const id = route.upload ?? items?.[0]?.id;
  const inRecent = items?.find(u => u.id === id);
  // Only fetched when the viewed upload is older than the sidebar's list (e.g. opened from All uploads).
  const detail = useUpload(inRecent ? undefined : id);
  return {
    recent: items,
    id,
    upload: inRecent ?? detail.data,
    loading: recent.isPending || (!inRecent && !!id && detail.isPending),
    error: recent.error ?? detail.error,
    empty: !!items && items.length === 0 && !route.upload,
  };
}
