/**
 * Static-site mode (GitHub Pages): the landing page is exported as plain files
 * under a sub-path, and there is no API server behind it. Links into the app
 * then point to the repository's setup guide instead of a login that cannot work.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export const STATIC_SITE = process.env.NEXT_PUBLIC_STATIC_SITE === '1';
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? 'https://github.com/muniraalhilal/madar';

/** Prefix a file in /public with the base path. */
export const asset = (path: string) => `${BASE_PATH}${path}`;

/** Where an "open the app" link should go in this build. */
export function appHref(path: string): { href: string; external: boolean } {
  if (!STATIC_SITE) return { href: path, external: false };
  return { href: `${REPO_URL}#quick-start-macos`, external: true };
}
