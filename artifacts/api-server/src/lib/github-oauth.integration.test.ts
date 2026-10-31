import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomInt } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, usersTable, booksTable, appAuthIdentitiesTable } from "@workspace/db";
import app from "../app";
import { frontendUrls, loginChallenge, opaqueCode } from "./auth-policy";
import { matchingState } from "./github-oauth";
import { upsertGithubReader, createHandoff, exchangeHandoff, findReader } from "./replit-session";
import { linkGithubReader } from "./account-linking";
import { createLibraryBook, listLibraryBooks } from "./library";
import { normalizeBookInput } from "./book-validation";

test("GitHub signup, OAuth guards, private sessions and verified library migration", async t => {
  const githubId = Date.now() + randomInt(100_000);
  const keys = [`github:${githubId}`, `replit:${githubId}`];
  const previousId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const previousSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  process.env.GITHUB_OAUTH_CLIENT_ID = "test-client-id";
  process.env.GITHUB_OAUTH_CLIENT_SECRET = "test-only-not-a-real-secret";
  const realFetch = globalThis.fetch;
  let githubRequests = 0;
  const usedCodes = new Set<string>();
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://github.com/login/oauth/access_token") {
      githubRequests++;
      assert.equal(init?.redirect, "error");
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get("client_id"), "test-client-id");
      assert.equal(body.get("client_secret"), "test-only-not-a-real-secret");
      assert.ok(matchingState(body.get("code_verifier"), body.get("code_verifier")));
      const code = body.get("code")!;
      if (usedCodes.has(code)) return Response.json({ error: "bad_verification_code" }, { status: 400 });
      usedCodes.add(code);
      return Response.json({ access_token: "test-only-provider-token", token_type: "bearer" });
    }
    if (url === "https://api.github.com/user") {
      githubRequests++;
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-only-provider-token");
      return Response.json({ id: githubId, login: "oauth-test-reader" });
    }
    if (url === "https://api.github.com/user/emails") {
      githubRequests++;
      return Response.json([
        { email: "unverified@example.invalid", verified: false, primary: true },
        { email: "fixture@example.invalid", verified: true, primary: true },
      ]);
    }
    return realFetch(input, init);
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing address");
  const root = `http://127.0.0.1:${address.port}`;
  const call = (path: string, init?: RequestInit) => realFetch(root + path, { ...init, redirect: "manual" });
  const returnTo = frontendUrls()[0], frontendVerifier = opaqueCode();
  const loginPath = "/api/login?" + new URLSearchParams({ returnTo, challenge: loginChallenge(frontendVerifier) });
  const catalogIds: number[] = [];
  try {
    const [legacy] = await db.insert(usersTable).values({
      clerkUserId: keys[1], username: "Old reader", email: "fixture@example.invalid",
    }).returning();
    await db.insert(appAuthIdentitiesTable).values({ subject: String(githubId), userId: legacy.id });
    const oldBook = await createLibraryBook(legacy.id, normalizeBookInput({
      title: `Preserved migration ${githubId}`, author: "OAuth test author", status: "read",
    }));
    catalogIds.push(oldBook.catalogBookId);
    await t.test("missing credentials give a safe setup message without breaking health", async () => {
      delete process.env.GITHUB_OAUTH_CLIENT_ID;
      delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
      try {
        const r = await call(loginPath);
        assert.equal(r.status, 302);
        assert.equal(new URL(r.headers.get("location")!).searchParams.get("login_error"), "configuration");
        assert.equal((await call("/api/healthz")).status, 200);
      } finally {
        process.env.GITHUB_OAUTH_CLIENT_ID = "test-client-id";
        process.env.GITHUB_OAUTH_CLIENT_SECRET = "test-only-not-a-real-secret";
      }
    });
    const start = await call(loginPath);
    assert.equal(start.status, 302);
    const authUrl = new URL(start.headers.get("location")!);
    const state = authUrl.searchParams.get("state")!;
    const cookie = start.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
    await t.test("authorization uses GitHub, PKCE, signup and no repository scopes", () => {
      assert.equal(authUrl.origin, "https://github.com");
      assert.equal(authUrl.pathname, "/login/oauth/authorize");
      assert.equal(authUrl.searchParams.get("scope"), "user:email");
      assert.equal(authUrl.searchParams.get("allow_signup"), "true");
      assert.equal(authUrl.searchParams.get("code_challenge_method"), "S256");
      assert.equal(authUrl.searchParams.get("code_challenge")?.length, 43);
      assert.equal(authUrl.searchParams.has("client_secret"), false);
      for (const c of start.headers.getSetCookie()) assert.match(c, /HttpOnly; Secure; SameSite=Lax/);
    });
    await t.test("bad state, missing cookies and cancellation never authenticate", async () => {
      assert.equal(matchingState("", ""), false);
      assert.equal(matchingState([state], state), false);
      const bad = await call(`/api/callback?state=${opaqueCode()}&code=code1`, { headers: { cookie } });
      assert.equal(new URL(bad.headers.get("location")!).searchParams.get("login_error"), "expired");
      assert.equal((await call(`/api/callback?state=${state}&code=code1`)).status, 400);
      const denied = await call(`/api/callback?state=${state}&error=access_denied`, { headers: { cookie } });
      assert.equal(new URL(denied.headers.get("location")!).searchParams.get("login_error"), "access_denied");
      assert.equal(githubRequests, 0);
    });
    const callback = await call(`/api/callback?state=${state}&code=code1`, { headers: { cookie } });
    const target = new URL(callback.headers.get("location")!);
    const handoff = target.searchParams.get("login_code")!;
    const exchange = await call("/api/auth/exchange", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: handoff, verifier: frontendVerifier }),
    });
    assert.equal(exchange.status, 200);
    const session = await exchange.json() as { token: string; user: { id: string; email: string } };
    const sourceId = Number(session.user.id);
    await t.test("first GitHub login creates its own user, not the same-email legacy account", async () => {
      assert.equal(githubRequests, 3);
      assert.notEqual(sourceId, legacy.id);
      assert.equal(session.user.email, "fixture@example.invalid");
      assert.deepEqual(await listLibraryBooks(sourceId), []);
      assert.equal((await listLibraryBooks(legacy.id)).length, 1);
      assert.equal(target.origin + target.pathname, returnTo);
      assert.equal(target.searchParams.has("access_token"), false);
      assert.equal(target.searchParams.has("token"), false);
    });
    await t.test("reused provider codes fail and username changes retain the same user", async () => {
      const repeat = await call(`/api/callback?state=${state}&code=code1`, { headers: { cookie } });
      assert.equal(new URL(repeat.headers.get("location")!).searchParams.get("login_error"), "provider_failed");
      const updated = await upsertGithubReader({ id: githubId, username: "renamed-reader", email: null });
      assert.equal(updated.id, sourceId);
      assert.equal((await findReader(session.token))?.username, "renamed-reader");
      const existing = await db.select().from(usersTable).where(inArray(usersTable.clerkUserId, keys));
      assert.equal(existing.length, 2);
    });
    await t.test("owner linking refuses a nonempty new library", async () => {
      const sourceBook = await createLibraryBook(sourceId, normalizeBookInput({
        title: `Temporary migration ${githubId}`, author: "OAuth test author", status: "want_to_read",
      }));
      catalogIds.push(sourceBook.catalogBookId);
      await assert.rejects(linkGithubReader(sourceId, legacy.id, true), /Source already has books or stars/);
      assert.equal((await call(`/api/books/${sourceBook.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.token}` } })).status, 204);
    });
    await t.test("dry run preserves data; applying replaces only the verified identity and revokes sessions", async () => {
      const oldVerifier = opaqueCode();
      const oldCode = await createHandoff(legacy.id, loginChallenge(oldVerifier));
      const oldSession = await exchangeHandoff(oldCode, loginChallenge(oldVerifier));
      const dry = await linkGithubReader(sourceId, legacy.id);
      assert.deepEqual(dry, { applied: false, replacesLegacyIdentity: true });
      assert.ok(await findReader(session.token));
      await linkGithubReader(sourceId, legacy.id, true);
      assert.equal(await findReader(session.token), null);
      assert.equal(await findReader(oldSession!.token), null);
      const linked = await upsertGithubReader({ id: githubId, username: "renamed-reader", email: null });
      assert.equal(linked.id, legacy.id);
      assert.equal((await listLibraryBooks(linked.id))[0].id, oldBook.id);
      assert.equal((await db.select().from(appAuthIdentitiesTable).where(eq(appAuthIdentitiesTable.subject, String(githubId)))).length, 0);
      assert.equal((await db.select().from(usersTable).where(inArray(usersTable.clerkUserId, keys))).length, 2);
    });
  } finally {
    server.close();
    t.mock.restoreAll();
    if (previousId === undefined) delete process.env.GITHUB_OAUTH_CLIENT_ID; else process.env.GITHUB_OAUTH_CLIENT_ID = previousId;
    if (previousSecret === undefined) delete process.env.GITHUB_OAUTH_CLIENT_SECRET; else process.env.GITHUB_OAUTH_CLIENT_SECRET = previousSecret;
    await db.delete(usersTable).where(inArray(usersTable.clerkUserId, keys));
    if (catalogIds.length) await db.delete(booksTable).where(inArray(booksTable.id, catalogIds));
  }
});
