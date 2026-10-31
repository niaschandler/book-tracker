import { Router } from "express";
import { ExchangeBrowserLoginBody, ExchangeBrowserLoginResponse, GetCurrentAuthUserResponse } from "@workspace/api-zod";
import { frontendUrls, safeFrontend, loginChallenge, validChallenge } from "../lib/auth-policy";
import { upsertGithubReader, createHandoff, exchangeHandoff, readerProfile, revokeSession, cleanExpiredSessions } from "../lib/replit-session";
import { GithubNotConfigured, githubAuthorization, matchingState, verifyGithubCode } from "../lib/github-oauth";
import { logger } from "../lib/logger";

const router = Router();
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
const cookieNames = ["bt_state", "bt_verifier", "bt_return", "bt_challenge"];
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
  try {
    const { url, state, verifier } = githubAuthorization();
    await cleanExpiredSessions();
    const values = [state, verifier, returnTo, req.query.challenge];
    cookieNames.forEach((name, i) => res.cookie(name, values[i], cookieOptions));
    res.redirect(url.href);
  } catch (error) {
    const target = new URL(returnTo);
    target.searchParams.set("login_error", error instanceof GithubNotConfigured ? "configuration" : "provider_failed");
    logger.warn("GitHub login could not start; no credentials logged.");
    res.redirect(target.href);
  }
});
router.get("/callback", async (req, res) => {
  const returnTo = safeFrontend(req.cookies?.bt_return, frontendUrls());
  const { bt_state: state, bt_verifier: verifier, bt_challenge: challenge } = req.cookies ?? {};
  cookieNames.forEach(name => res.clearCookie(name, { ...cookieOptions, maxAge: undefined }));
  if (!returnTo) { res.status(400).json({ error: "Sign-in state expired. Return to the app and try again." }); return; }
  const target = new URL(returnTo);
  if (!matchingState(req.query.state, state) || !validChallenge(verifier) || !validChallenge(challenge)) {
    target.searchParams.set("login_error", "expired");
    res.redirect(target.href);
    return;
  }
  if (req.query.error === "access_denied") {
    target.searchParams.set("login_error", "access_denied");
    res.redirect(target.href);
    return;
  }
  try {
    if (typeof req.query.code !== "string" || !/^[A-Za-z0-9_-]{1,512}$/.test(req.query.code)) throw new Error("Missing GitHub authorization code.");
    const reader = await verifyGithubCode(req.query.code, verifier);
    const user = await upsertGithubReader(reader);
    target.searchParams.set("login_code", await createHandoff(user.id, challenge));
  } catch {
    logger.warn("GitHub login could not be completed; no identity or token details logged.");
    target.searchParams.set("login_error", "provider_failed");
  }
  res.redirect(target.href);
});
export default router;
