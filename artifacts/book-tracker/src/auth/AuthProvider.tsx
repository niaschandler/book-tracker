import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setAuthTokenGetter, setBaseUrl, type AuthReader, type AuthUserEnvelope, type BrowserLoginSession } from '@workspace/api-client-react';
import { TOKEN_KEY, VERIFIER_KEY, challengeFor, createVerifier, friendlyLoginError, frontendRoot, loginUrl, parseApiOrigin, readCallback } from './auth-helpers';

let configError = '';
let apiOrigin = '';
try { apiOrigin = parseApiOrigin(import.meta.env.VITE_API_ORIGIN); } catch (e) { configError = e instanceof Error ? e.message : 'Invalid API origin.'; }
const readToken = () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
const writeToken = (t: string | null) => { try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } };
setBaseUrl(apiOrigin || null);
setAuthTokenGetter(() => readToken());

class HttpError extends Error { constructor(public status: number) { super(`Request failed (${status})`); } }
async function authFetch<T>(path: string, init: RequestInit = {}, token = readToken()): Promise<T | null> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${apiOrigin}${path}`, { ...init, headers, credentials: 'omit' });
  if (!res.ok) throw new HttpError(res.status);
  return res.status === 204 ? null : (await res.json()) as T;
}

// Module-level so StrictMode double effects and remounts never exchange a code twice.
let exchangeOnce: Promise<BrowserLoginSession> | null = null;

export type AuthUser = {
  id: string; username: string | null; firstName: string | null; lastName: string | null;
  primaryEmailAddress: { emailAddress: string } | null; emailAddresses: { emailAddress: string }[];
};
type Status = 'loading' | 'signedIn' | 'signedOut';
type Ctx = {
  status: Status; user: AuthUser | null; loginError: string; logoutError: string; restoreError: string; signingIn: boolean;
  signIn: () => Promise<void>; signOut: () => Promise<boolean>; retryRestore: () => void; dismissErrors: () => void;
};
const AuthContext = createContext<Ctx | null>(null);

function toUser(r: AuthReader): AuthUser {
  const emails = r.email ? [{ emailAddress: r.email }] : [];
  return { id: r.id, username: r.username, firstName: r.username, lastName: null, primaryEmailAddress: emails[0] ?? null, emailAddresses: emails };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loginError, setLoginError] = useState(configError);
  const [logoutError, setLogoutError] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const userIdRef = useRef<string | null>(null);

  const expose = useCallback(async (reader: AuthReader | null) => {
    const nextId = reader?.id ?? null;
    if (userIdRef.current !== nextId) { await qc.cancelQueries(); qc.clear(); }
    userIdRef.current = nextId;
    setUser(reader ? toUser(reader) : null);
    setStatus(reader ? 'signedIn' : 'signedOut');
  }, [qc]);

  const restore = useCallback(async () => {
    setRestoreError('');
    if (!readToken()) { await expose(null); return; }
    setStatus('loading');
    try {
      const env = await authFetch<AuthUserEnvelope>('/api/auth/user');
      if (!env?.user) writeToken(null);
      await expose(env?.user ?? null);
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) { writeToken(null); await expose(null); return; }
      setRestoreError('We could not reach your reading room. Check your connection and try again.');
      await expose(null);
    }
  }, [expose]);

  useEffect(() => {
    if (configError) { setStatus('signedOut'); return undefined; }
    const cb = readCallback(window.location.href);
    if (cb.code || cb.error) window.history.replaceState(window.history.state, '', cb.cleaned);
    if (cb.error) { try { sessionStorage.removeItem(VERIFIER_KEY); } catch { /* ignore */ } setLoginError(friendlyLoginError(cb.error)); }
    if (cb.code || exchangeOnce) {
      if (!exchangeOnce && cb.code) {
        let verifier: string | null = null;
        try { verifier = sessionStorage.getItem(VERIFIER_KEY); sessionStorage.removeItem(VERIFIER_KEY); } catch { /* ignore */ }
        if (!verifier) { setLoginError('This sign-in started in a different tab or expired. Please continue with GitHub again.'); void restore(); return undefined; }
        exchangeOnce = authFetch<BrowserLoginSession>('/api/auth/exchange', { method: 'POST', body: JSON.stringify({ code: cb.code, verifier }) }, null)
          .then(s => { if (!s?.token) throw new Error('No session'); return s; });
      }
      let live = true;
      exchangeOnce!.then(async s => { writeToken(s.token); if (live) await expose(s.user); })
        .catch(async () => { if (live) { setLoginError('That sign-in could not be completed. Sign-in links work once and expire after two minutes. Please try again.'); await restore(); } });
      return () => { live = false; };
    }
    void restore();
    return undefined;
  }, [expose, restore]);

  // Clear an expired session when any API call returns 401.
  useEffect(() => {
    const onError = (err: unknown) => {
      if ((err as { status?: number } | null)?.status === 401 && readToken()) { writeToken(null); void expose(null); }
    };
    const a = qc.getQueryCache().subscribe(ev => { if (ev.type === 'updated' && ev.action.type === 'error') onError(ev.action.error); });
    const b = qc.getMutationCache().subscribe(ev => { if (ev.type === 'updated' && ev.action.type === 'error') onError(ev.action.error); });
    return () => { a(); b(); };
  }, [qc, expose]);

  const signIn = useCallback(async () => {
    if (configError) return;
    setSigningIn(true); setLoginError('');
    try {
      const verifier = createVerifier();
      sessionStorage.setItem(VERIFIER_KEY, verifier);
      const challenge = await challengeFor(verifier);
      window.location.assign(loginUrl(apiOrigin, frontendRoot(window.location.origin, import.meta.env.BASE_URL), challenge));
    } catch {
      setSigningIn(false);
      setLoginError('Your browser blocked the secure sign-in step. Allow site storage and try again.');
    }
  }, []);

  const signOut = useCallback(async () => {
    const token = readToken();
    setLogoutError('');
    let ok = true;
    if (token) {
      try { await authFetch<null>('/api/auth/logout', { method: 'POST' }, token); }
      catch (e) { ok = e instanceof HttpError && e.status === 401; }
    }
    writeToken(null);
    await expose(null);
    if (!ok) setLogoutError('You are signed out on this device, but we could not confirm the server ended your session. Sign in and sign out again to retry.');
    return ok;
  }, [expose]);

  const value = useMemo<Ctx>(() => ({
    status, user, loginError, logoutError, restoreError, signingIn, signIn, signOut,
    retryRestore: () => { void restore(); }, dismissErrors: () => { setLoginError(configError); setLogoutError(''); },
  }), [status, user, loginError, logoutError, restoreError, signingIn, signIn, signOut, restore]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useCtx() { const c = useContext(AuthContext); if (!c) throw new Error('Auth hooks need <AuthProvider>'); return c; }
export function useAuth() { const c = useCtx(); return { isLoaded: c.status !== 'loading', isSignedIn: c.status === 'signedIn', userId: c.user?.id ?? null }; }
export function useUser() { const c = useCtx(); return { isLoaded: c.status !== 'loading', isSignedIn: c.status === 'signedIn', user: c.user }; }
export function useSession() { return useCtx(); }
