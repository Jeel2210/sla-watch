// Server data for the whole app, through TanStack Query (ADR-012). Keys = endpoint + params.
// Every queryFn passes TanStack's AbortSignal, so a request is cancelled when its filters change.
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HEX_MAX_DAYS, type HexDay, type UploadCreated } from '@sla/core';
import { SERVICE_OPTIONS_PAGE, SVC_PAGE, TL_BINS, TL_PAGE, UPLOADS_STALE_MS } from '../lib/constants';
import {
  checkFile, getChecks, getHex, getIncidents, getServices, getStats, getTimeline, getUpload, getUploads, gzipFile, postUpload,
  ApiError, type ChecksQuery,
} from './client';

export const keys = {
  uploads: (q: { q?: string; cursor?: string; limit: number }) => ['uploads', q] as const,
  upload: (id: string) => ['upload', id] as const,
  stats: (id: string) => ['stats', id] as const,
  services: (id: string, q: string) => ['services', id, q] as const,
  hex: (id: string, serviceId: string, from: number, days: number) => ['hex', id, serviceId, from, days] as const,
  timeline: (id: string, offset: number) => ['timeline', id, offset] as const,
  incidents: (id: string) => ['incidents', id] as const,
  checks: (id: string, q: ChecksQuery, cursor: string | undefined, limit: number) => ['checks', id, q, cursor, limit] as const,
  serviceOptions: (id: string) => ['service-options', id] as const,
  hexAll: (id: string, serviceId: string) => ['hex-all', id, serviceId] as const,
};

/**
 * One page of uploads, newest first. Keeps the previous page on screen while the next loads. Refreshed after
 * our own uploads (useUploadFile), and when the tab regains focus, so uploads made elsewhere show up too.
 */
export function useUploadsPage(q: { q?: string; cursor?: string; limit: number }) {
  return useQuery({
    queryKey: keys.uploads(q),
    queryFn: ({ signal }) => getUploads(q, signal),
    placeholderData: keepPreviousData,
    staleTime: UPLOADS_STALE_MS,
    refetchOnWindowFocus: true,
  });
}

export function useUpload(id: string | undefined) {
  return useQuery({ queryKey: keys.upload(id ?? ''), queryFn: ({ signal }) => getUpload(id!, signal), enabled: !!id });
}

export function useStats(id: string | undefined) {
  return useQuery({ queryKey: keys.stats(id ?? ''), queryFn: ({ signal }) => getStats(id!, signal), enabled: !!id });
}

/** Services worst first, SVC_PAGE at a time as the list scrolls; `q` is searched on the server. */
export function useServices(id: string | undefined, q: string) {
  return useInfiniteQuery({
    queryKey: keys.services(id ?? '', q),
    queryFn: ({ pageParam, signal }) => getServices(id!, { q: q || undefined, cursor: pageParam, limit: SVC_PAGE }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor ?? undefined,
    enabled: !!id,
  });
}

export function useHex(id: string | undefined, serviceId: string | undefined, from: number, days: number) {
  return useQuery({
    queryKey: keys.hex(id ?? '', serviceId ?? '', from, days),
    queryFn: ({ signal }) => getHex(id!, serviceId!, { from, days }, signal),
    enabled: !!id && !!serviceId && days > 0,
    placeholderData: keepPreviousData,
  });
}

/** Loads a hex page before it is needed (the pager's next page), so paging feels instant. */
export function usePrefetchHex() {
  const qc = useQueryClient();
  return (id: string, serviceId: string, from: number, days: number) =>
    qc.prefetchQuery({ queryKey: keys.hex(id, serviceId, from, days), queryFn: ({ signal }) => getHex(id, serviceId, { from, days }, signal) });
}

/** Every day of one service (Full view), in requests of at most HEX_MAX_DAYS days. */
export function useHexAll(id: string | undefined, serviceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: keys.hexAll(id ?? '', serviceId ?? ''),
    queryFn: async ({ signal }) => {
      const days: HexDay[] = [];
      let total = Infinity;
      for (let from = 0; from < total; from += HEX_MAX_DAYS) {
        const page = await getHex(id!, serviceId!, { from, days: HEX_MAX_DAYS }, signal);
        total = page.totalDays;
        days.push(...page.days);
      }
      return days;
    },
    enabled: enabled && !!id && !!serviceId,
  });
}

export function useTimeline(id: string | undefined, offset: number) {
  return useQuery({
    queryKey: keys.timeline(id ?? '', offset),
    queryFn: ({ signal }) => getTimeline(id!, { bins: TL_BINS, offset, limit: TL_PAGE }, signal),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}

export function useIncidents(id: string | undefined) {
  return useInfiniteQuery({
    queryKey: keys.incidents(id ?? ''),
    queryFn: ({ pageParam, signal }) => getIncidents(id!, { cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor ?? undefined,
    enabled: !!id,
  });
}

/** One page of logs. The previous page stays visible (dimmed) while the next loads. */
export function useChecks(id: string | undefined, q: ChecksQuery, cursor: string | undefined, limit: number) {
  return useQuery({
    queryKey: keys.checks(id ?? '', q, cursor, limit),
    queryFn: ({ signal }) => getChecks(id!, { ...q, cursor, limit }, signal),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}

/** Loads the page after this one ahead of time, so Next is instant (ARCHITECTURE.md → Frontend caching). */
export function usePrefetchChecks() {
  const qc = useQueryClient();
  return (id: string, q: ChecksQuery, cursor: string, limit: number) =>
    qc.prefetchQuery({ queryKey: keys.checks(id, q, cursor, limit), queryFn: ({ signal }) => getChecks(id, { ...q, cursor, limit }, signal) });
}

/** Every service's id and name, for the logs' Service filter. Fetched only when the filters open. */
export function useServiceOptions(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: keys.serviceOptions(id ?? ''),
    queryFn: async ({ signal }) => {
      const all: { id: string; name: string }[] = [];
      let cursor: string | undefined;
      do {
        const p = await getServices(id!, { cursor, limit: SERVICE_OPTIONS_PAGE }, signal);
        all.push(...p.items.map(s => ({ id: s.id, name: s.name })));
        cursor = p.nextCursor ?? undefined;
      } while (cursor);
      return all.sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: !!id && enabled,
  });
}

/** Where an upload is in its journey; drives the steps on the Uploads screen. */
export type UploadPhase = 'compress' | 'send';

/** Validates, gzips and uploads a CSV; refreshes every upload list when it is stored. */
export function useUploadFile(onPhase?: (p: UploadPhase, gzipBytes?: number) => void) {
  const qc = useQueryClient();
  return useMutation<UploadCreated, ApiError, File>({
    mutationFn: async file => {
      const invalid = checkFile(file);
      if (invalid) throw new ApiError(400, { error: invalid });
      onPhase?.('compress');
      const gz = await gzipFile(file);
      onPhase?.('send', gz.size);
      return postUpload(file.name, gz);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['uploads'] }),
  });
}
