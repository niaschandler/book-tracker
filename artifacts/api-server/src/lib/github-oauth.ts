import { timingSafeEqual } from "node:crypto";
import { loginChallenge, opaqueCode, publicApiOrigin } from "./auth-policy";

export class GithubNotConfigured extends Error {}
export type GithubReader = { id: number; username: string; email: string | null };

function credentials() {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new GithubNotConfigured("GitHub OAuth credentials are missing.");
  return { clientId, clientSecret };
}

export function matchingState(received: unknown, expected: unknown): boolean {
  return typeof received === "string" && typeof expected === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(received) && /^[A-Za-z0-9_-]{43}$/.test(expected) &&
    timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export function githubAuthorization() {
  const { clientId } = credentials();
  const state = opaqueCode(), verifier = opaqueCode();
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: `${publicApiOrigin()}/api/callback`,
    state, code_challenge: loginChallenge(verifier), code_challenge_method: "S256",
    scope: "user:email", allow_signup: "true", prompt: "select_account",
  }).toString();
  return { url, state, verifier };
}

export async function verifyGithubCode(code: string, verifier: string, request: typeof fetch = fetch): Promise<GithubReader> {
  const { clientId, clientSecret } = credentials();
  const tokenResponse = await request("https://github.com/login/oauth/access_token", {
    method: "POST", signal: AbortSignal.timeout(15_000), redirect: "error",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code,
      code_verifier: verifier, redirect_uri: `${publicApiOrigin()}/api/callback` }),
  });
  if (!tokenResponse.ok) throw new Error("GitHub code exchange failed.");
  const token = await tokenResponse.json() as { access_token?: unknown; token_type?: unknown; error?: unknown };
  if (token.error || typeof token.access_token !== "string" || !token.access_token ||
      typeof token.token_type !== "string" || token.token_type.toLowerCase() !== "bearer") {
    throw new Error("GitHub did not return a valid access token.");
  }
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token.access_token}`,
    "User-Agent": "Marginalia-book-tracker", "X-GitHub-Api-Version": "2022-11-28" };
  const profileResponse = await request("https://api.github.com/user", {
    headers, signal: AbortSignal.timeout(15_000), redirect: "error",
  });
  if (!profileResponse.ok) throw new Error("GitHub identity verification failed.");
  const profile = await profileResponse.json() as { id?: unknown; login?: unknown };
  if (typeof profile.id !== "number" || !Number.isSafeInteger(profile.id) || profile.id < 1 ||
      typeof profile.login !== "string" || !profile.login.trim()) {
    throw new Error("GitHub identity is invalid.");
  }
  const emailsResponse = await request("https://api.github.com/user/emails", {
    headers, signal: AbortSignal.timeout(15_000), redirect: "error",
  });
  if (!emailsResponse.ok) throw new Error("GitHub email lookup failed.");
  const emails: unknown = await emailsResponse.json();
  if (!Array.isArray(emails)) throw new Error("GitHub email response is invalid.");
  const email = emails.find(value => value && value.primary === true && value.verified === true && typeof value.email === "string");
  // GitHub access/refresh tokens never leave this function or enter the database.
  // Email is profile information, never an account-linking key.
  return { id: profile.id, username: profile.login, email: email?.email ?? null };
}
