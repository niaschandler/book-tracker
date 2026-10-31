import { Router } from "express";
import * as oidc from "openid-client";
import { ExchangeBrowserLoginBody, ExchangeBrowserLoginResponse, GetCurrentAuthUserResponse } from "@workspace/api-zod";
import { frontendUrls, safeFrontend, publicApiOrigin, loginChallenge, validChallenge } from "../lib/auth-policy";
import { oidcConfig, upsertReplitReader, createHandoff, exchangeHandoff, readerProfile, revokeSession, cleanExpiredSessions } from "../lib/replit-session";
import { logger } from "../lib/logger";

const router = Router();
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
const cookieNames = ["bt_state", "bt_nonce", "bt_verifier", "bt_return", "bt_challenge"];
const cookieOptions = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/api/callback", maxAge: 600_000 };
router.get("/auth/user", (_req, res) => {
  res.json(GetCurrentAuthUserResponse.parse({ user: res.locals.reader ? readerProfile(res.locals.reader) : null }));
});
router.post("/auth/logout", async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (token) await revokeSession(token);
  res.status(204).end();
});
router.post("/auth/exchange", async (req, res) => {
  const parsed = ExchangeBrowserLoginBody.safeParse(req.body);
  if (!parsed.success || !/^[A-Za-z0-9_-]{43,128}$/.test(parsed.data.verifier)) {
    res.status(400).json({ error: "This sign-in link is invalid. Please sign in again." }); return;
  }
  const session = await exchangeHandoff(parsed.data.code, loginChallenge(parsed.data.verifier));
  if (!session) { res.status(401).json({ error: "This sign-in link expired or was already used. Please sign in again." }); return; }
  res.json(ExchangeBrowserLoginResponse.parse(session));
});
router.get("/login", async (req, res) => {
  const returnTo = safeFrontend(req.query.returnTo, frontendUrls());
  if (!returnTo || !validChallenge(req.query.challenge)) {
    res.status(400).json({ error: "Invalid frontend address or login proof." }); return;
  }
  const config = await oidcConfig();
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const values = [state, nonce, verifier, returnTo, req.query.challenge];
  cookieNames.forEach((name, i) => res.cookie(name, values[i], cookieOptions));
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: `${publicApiOrigin()}/api/callback`,
    scope: "openid email profile", state, nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: "S256",
    prompt: "login consent",
  });
  await cleanExpiredSessions();
  res.redirect(url.href);
});
router.get("/callback", async (req, res) => {
  const returnTo = safeFrontend(req.cookies?.bt_return, frontendUrls());
  const { bt_state: state, bt_nonce: nonce, bt_verifier: verifier, bt_challenge: challenge } = req.cookies ?? {};
  cookieNames.forEach(name => res.clearCookie(name, { ...cookieOptions, maxAge: undefined }));
  if (!returnTo) { res.status(400).json({ error: "Sign-in state expired. Return to the app and try again." }); return; }
  const target = new URL(returnTo);
  try {
    if (!state || !nonce || !verifier || !validChallenge(challenge)) throw new Error("Missing login state");
    const config = await oidcConfig();
    const callback = new URL(`${publicApiOrigin()}/api/callback`);
    callback.search = new URL(req.originalUrl, callback).search;
    const tokens = await oidc.authorizationCodeGrant(config, callback, {
      pkceCodeVerifier: verifier, expectedState: state, expectedNonce: nonce, idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims?.sub) throw new Error("Missing verified subject");
    const user = await upsertReplitReader(claims);
    target.searchParams.set("login_code", await createHandoff(user.id, challenge));
  } catch {
    logger.warn("Replit login could not be completed; no identity or token details logged.");
    target.searchParams.set("login_error", "Sign-in could not be completed. Please try again.");
  }
  res.redirect(target.href);
});
export default router;
