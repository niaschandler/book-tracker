import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { and, eq, inArray } from "drizzle-orm";
import { db, usersTable, booksTable, appAuthHandoffsTable, appAuthSessionsTable } from "@workspace/db";
import app from "../app";
import { createHandoff, exchangeHandoff, findReader, revokeSession } from "./replit-session";
import { loginChallenge, opaqueCode, sessionHash, frontendUrls } from "./auth-policy";
import { listLibraryBooks } from "./library";

test("Replit session handoff, privacy, expiry, origin restrictions and logout", async t => {
  const suffix = opaqueCode();
  const users = await db.insert(usersTable).values([
    { clerkUserId: `auth-test-a:${suffix}`, username: "Test reader A" },
    { clerkUserId: `auth-test-b:${suffix}`, username: "Test reader B" },
  ]).returning();
  const catalogIds: number[] = [];
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address");
  const root = `http://127.0.0.1:${address.port}`;
  const call = (path: string, token?: string, init: RequestInit = {}) => fetch(root + path, {
    ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    redirect: "manual",
  });
  try {
    const verifier = opaqueCode();
    const codeA = await createHandoff(users[0].id, loginChallenge(verifier));
    let tokenA = "", tokenB = "", bookId = 0;
    await t.test("a wrong proof does not consume a valid handoff", async () => {
      assert.equal(await exchangeHandoff(codeA, loginChallenge(opaqueCode())), null);
      const response = await call("/api/auth/exchange", undefined, { method: "POST", body: JSON.stringify({ code: codeA, verifier }) });
      assert.equal(response.status, 200);
      const body = await response.json() as { token: string; user: { id: string } };
      tokenA = body.token;
      assert.equal(body.user.id, String(users[0].id));
      const [stored] = await db.select().from(appAuthSessionsTable).where(eq(appAuthSessionsTable.userId, users[0].id));
      assert.notEqual(stored.tokenHash, tokenA);
      assert.equal(stored.tokenHash, sessionHash(tokenA));
    });
    await t.test("handoffs are single use and an expired one cannot create a session", async () => {
      assert.equal(await exchangeHandoff(codeA, loginChallenge(verifier)), null);
      const code = await createHandoff(users[1].id, loginChallenge(verifier));
      await db.update(appAuthHandoffsTable).set({ expiresAt: new Date(0) }).where(eq(appAuthHandoffsTable.codeHash, sessionHash(code)));
      assert.equal(await exchangeHandoff(code, loginChallenge(verifier)), null);
      const fresh = await createHandoff(users[1].id, loginChallenge(verifier));
      const result = await exchangeHandoff(fresh, loginChallenge(verifier));
      assert.ok(result);
      tokenB = result.token;
    });
    await t.test("all private book operations remain scoped to the authenticated reader", async () => {
      const created = await call("/api/books", tokenA, { method: "POST", body: JSON.stringify({ title: `Private ${suffix}`, author: "Test author", status: "want_to_read" }) });
      assert.equal(created.status, 201);
      bookId = (await created.json() as { id: number }).id;
      catalogIds.push(...(await listLibraryBooks(users[0].id)).map(book => book.catalogBookId));
      assert.equal((await call(`/api/books/${bookId}`, tokenB)).status, 404);
      assert.equal((await call(`/api/books/${bookId}`, tokenB, { method: "DELETE" })).status, 404);
      const listB = await (await call("/api/books", tokenB)).json();
      const exportB = await (await call("/api/books/export", tokenB)).json();
      assert.deepEqual(listB, []);
      assert.deepEqual(exportB, []);
      assert.equal((await call("/api/books")).status, 401);
    });
    await t.test("untrusted origins and open login redirects are rejected", async () => {
      assert.equal((await call("/api/books", tokenA, { headers: { Origin: "https://evil.test" } })).status, 403);
      const allowedOrigin = new URL(frontendUrls()[0]).origin;
      const preflight = await call("/api/books", undefined, { method: "OPTIONS", headers: { Origin: allowedOrigin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" } });
      assert.equal(preflight.headers.get("access-control-allow-origin"), allowedOrigin);
      const badLogin = await call("/api/login?returnTo=https%3A%2F%2Fevil.test%2F&challenge=" + loginChallenge(verifier));
      assert.equal(badLogin.status, 400);
      assert.equal((await call("/api/callback?code=not-a-real-code")).status, 400);
    });
    await t.test("logout revokes server access and expired tokens do not work", async () => {
      assert.equal((await call("/api/auth/user", tokenA)).status, 200);
      assert.equal((await call("/api/auth/logout", tokenA, { method: "POST" })).status, 204);
      assert.equal(await findReader(tokenA), null);
      assert.equal((await call(`/api/books/${bookId}`, tokenA)).status, 401);
      await db.update(appAuthSessionsTable).set({ expiresAt: new Date(0) }).where(eq(appAuthSessionsTable.tokenHash, sessionHash(tokenB)));
      assert.equal(await findReader(tokenB), null);
      await revokeSession(tokenB);
    });
  } finally {
    server.close();
    await db.delete(usersTable).where(inArray(usersTable.id, users.map(user => user.id)));
    if (catalogIds.length) await db.delete(booksTable).where(inArray(booksTable.id, catalogIds));
  }
});
