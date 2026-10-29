'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { STATIC_SITE } from './site';

/**
 * Links to record pages. A static host can only serve pages that exist at build
 * time, so the static build has one page per record type and passes the id as
 * ?id= (e.g. /app/scenarios/view/?id=…). With a server, ids stay in the path.
 */
const at = (base: string, id: string, query = '') => (STATIC_SITE ? `${base}/view?id=${encodeURIComponent(id)}${query ? `&${query}` : ''}` : `${base}/${id}${query ? `?${query}` : ''}`);

export const href = {
  scenario: (id: string, query = '') => at('/app/scenarios', id, query),
  run: (id: string) => at('/app/results', id),
  report: (id: string) => at('/app/reports', id),
};

/** Rewrites an in-app link that may contain a record id in the path (e.g. from a notification). */
export function appPath(link: string): string {
  const m = link.match(/^\/app\/(scenarios|results|reports)\/([^/?]+)(?:\?(.*))?$/);
  if (!m || m[2] === 'view') return link;
  return at(`/app/${m[1]}`, m[2]!, m[3] ?? '');
}

/** The record id of the current page, from the path or (static build) the query string. */
export function useRouteId(param: string): string {
  const params = useParams<Record<string, string>>();
  const search = useSearchParams();
  const v = params[param];
  return (v === 'view' ? search.get('id') : v) ?? '';
}

/** The single prebuilt path segment the static export generates for record pages. */
export const STATIC_RECORD_PARAM = 'view';
