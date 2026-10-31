export const TOKEN_KEY = 'marginalia.session';
export const VERIFIER_KEY = 'marginalia.login-verifier';

export function base64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createVerifier(random: (a: Uint8Array) => Uint8Array = a => crypto.getRandomValues(a)): string {
  return base64Url(random(new Uint8Array(32)));
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** Validates VITE_API_ORIGIN. Empty means same origin. Throws on unsafe values. */
export function parseApiOrigin(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('VITE_API_ORIGIN must be an absolute URL.'); }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('VITE_API_ORIGIN must use HTTPS.');
  if (url.username || url.password || (url.pathname && url.pathname !== '/') || url.search || url.hash || value.endsWith('?') || value.endsWith('#')) {
    throw new Error('VITE_API_ORIGIN must be an origin only, without path, query or fragment.');
  }
  return url.origin;
}

/** Absolute frontend root (BASE_URL) with trailing slash, no query or hash. */
export function frontendRoot(origin: string, baseUrl: string): string {
  const base = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`;
  return `${origin}${base.endsWith('/') ? base : `${base}/`}`;
}

export function loginUrl(apiOrigin: string, returnTo: string, challenge: string): string {
  const q = new URLSearchParams({ returnTo, challenge });
  return `${apiOrigin}/api/login?${q.toString()}`;
}

export type CallbackParams = { code: string | null; error: string | null; cleaned: string };

/** Reads login_code / login_error and returns the URL without them, keeping other params and the hash. */
export function readCallback(href: string): CallbackParams {
  const url = new URL(href);
  const code = url.searchParams.get('login_code');
  const error = url.searchParams.get('login_error');
  url.searchParams.delete('login_code');
  url.searchParams.delete('login_error');
  return { code, error, cleaned: `${url.pathname}${url.search}${url.hash}` };
}

const errorCopy: Record<string, string> = {
  access_denied: 'GitHub sign-in was cancelled. You can try again whenever you are ready.',
  configuration: 'GitHub sign-in is not configured yet. The site owner needs to finish the GitHub OAuth setup.',
  provider_failed: 'We could not finish signing you in with GitHub. Please try again.',
  expired: 'That sign-in link expired. Please start again.',
};
export function friendlyLoginError(code: string | null): string {
  if (!code) return '';
  return errorCopy[code] ?? 'We could not finish signing you in with GitHub. Please try again.';
}
