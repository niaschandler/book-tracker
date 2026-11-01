import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { inArray } from "drizzle-orm";
import { authorsTable, booksTable, db, genresTable, pool, usersTable } from "@workspace/db";
import app from "../app";
import { createHandoff, exchangeHandoff } from "./replit-session";
import { loginChallenge, opaqueCode } from "./auth-policy";

after(async () => { await pool.end(); });

test("User B cannot read or change User A's private library data", async (t) => {
  const suffix = randomUUID();
  const titleA = `Isolation A ${suffix}`;
  const titleB = `Isolation B ${suffix}`;
  const authorA = `Isolation author A ${suffix}`;
  const authorB = `Isolation author B ${suffix}`;
  const genreA = `Isolation genre A ${suffix}`;
  const genreB = `Isolation genre B ${suffix}`;
  const users = await db.insert(usersTable).values([
    { clerkUserId: `data-isolation-a:${suffix}`, username: `reader-a-${suffix}` },
    { clerkUserId: `data-isolation-b:${suffix}`, username: `reader-b-${suffix}` },
  ]).returning();
  const server = app.listen(0, "127.0.0.1");

  try {
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    const root = `http://127.0.0.1:${address.port}`;
    const call = (path: string, token: string, init: RequestInit = {}) => fetch(root + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
    const createSession = async (userId: number) => {
      const verifier = opaqueCode();
      const code = await createHandoff(userId, loginChallenge(verifier));
      const session = await exchangeHandoff(code, loginChallenge(verifier));
      assert.ok(session, "test reader should receive an authenticated session");
      return session.token;
    };
    const tokenA = await createSession(users[0].id);
    const tokenB = await createSession(users[1].id);
    const createdA = await call("/api/books", tokenA, {
      method: "POST",
      body: JSON.stringify({
        title: titleA, author: authorA, genre: genreA, pages: 480, rating: 5,
        status: "read", notes: "A private note", moodTags: ["reader-a"],
        startedOn: "2026-01-01", finishedOn: "2026-01-08",
      }),
    });
    assert.equal(createdA.status, 201);
    const bookA = await createdA.json() as { id: number; title: string; starred: boolean };

    const createdB = await call("/api/books", tokenB, {
      method: "POST",
      body: JSON.stringify({
        title: titleB, author: authorB, genre: genreB, pages: 90, isOwned: true,
        status: "want_to_read", notes: "B private note", moodTags: ["reader-b"],
      }),
    });
    assert.equal(createdB.status, 201);
    const bookB = await createdB.json() as { id: number; title: string; starred: boolean };

    const starredA = await call(`/api/books/${bookA.id}/star`, tokenA, {
      method: "PUT", body: JSON.stringify({ starred: true }),
    });
    assert.equal(starredA.status, 200);

    await t.test("each signed-in user sees only their own library and export", async () => {
      const [listA, listB, exportA, exportB] = await Promise.all([
        call("/api/books", tokenA), call("/api/books", tokenB),
        call("/api/books/export", tokenA), call("/api/books/export", tokenB),
      ]);
      assert.equal(listA.status, 200);
      assert.equal(listB.status, 200);
      assert.equal(exportA.status, 200);
      assert.equal(exportB.status, 200);
      const [rowsA, rowsB, exportedA, exportedB] = await Promise.all([
        listA.json(), listB.json(), exportA.json(), exportB.json(),
      ]) as Array<Array<{ id: number; title: string; notes: string | null; starred: boolean }>>;
      assert.deepEqual(rowsA.map(row => row.id), [bookA.id]);
      assert.deepEqual(rowsB.map(row => row.id), [bookB.id]);
      assert.deepEqual(exportedA.map(row => row.id), [bookA.id]);
      assert.deepEqual(exportedB.map(row => row.id), [bookB.id]);
      assert.equal(rowsA[0].notes, "A private note");
      assert.equal(rowsB[0].notes, "B private note");
      assert.equal(rowsA[0].starred, true);
      assert.equal(rowsB[0].starred, false);
      const starredOnlyB = await call("/api/books?starredOnly=true", tokenB);
      assert.equal(starredOnlyB.status, 200);
      assert.equal((await starredOnlyB.json() as unknown[]).length, 0);
    });

    await t.test("dashboard, picker, and current-user responses stay scoped to the session", async () => {
      const [summaryAResponse, summaryBResponse, nextAResponse, nextBResponse, userBResponse] = await Promise.all([
        call("/api/dashboard/summary", tokenA),
        call("/api/dashboard/summary", tokenB),
        call("/api/books/next", tokenA),
        call("/api/books/next", tokenB),
        call("/api/auth/user", tokenB),
      ]);
      const [summaryA, summaryB, nextA, nextB, currentB] = await Promise.all([
        summaryAResponse.json(), summaryBResponse.json(),
        nextAResponse.json(), nextBResponse.json(), userBResponse.json(),
      ]) as [
        { totalBooks: number; readCount: number; totalPagesRead: number; longestReadBook: { title: string } | null },
        { totalBooks: number; readCount: number; totalPagesRead: number; longestReadBook: { title: string } | null },
        { book: { id: number; title: string } | null },
        { book: { id: number; title: string } | null },
        { user: { id: string } },
      ];
      assert.equal(summaryA.totalBooks, 1);
      assert.equal(summaryA.readCount, 1);
      assert.equal(summaryA.totalPagesRead, 480);
      assert.equal(summaryA.longestReadBook?.title, titleA);
      assert.equal(summaryB.totalBooks, 1);
      assert.equal(summaryB.readCount, 0);
      assert.equal(summaryB.totalPagesRead, 0);
      assert.equal(summaryB.longestReadBook, null);
      assert.equal(nextA.book, null);
      assert.deepEqual(nextB.book && { id: nextB.book.id, title: nextB.book.title }, { id: bookB.id, title: titleB });
      assert.equal(currentB.user.id, String(users[1].id));
      assert.notEqual(currentB.user.id, String(users[0].id));
    });

    await t.test("import duplicate detection uses only the active reader's library", async () => {
      const rows = [{ row: 2, values: { title: titleA, author: authorA, status: "read" } }];
      const [previewAResponse, previewBResponse] = await Promise.all([
        call("/api/books/import/preview", tokenA, { method: "POST", body: JSON.stringify({ rows }) }),
        call("/api/books/import/preview", tokenB, { method: "POST", body: JSON.stringify({ rows }) }),
      ]);
      assert.equal(previewAResponse.status, 200);
      assert.equal(previewBResponse.status, 200);
      const [previewA, previewB] = await Promise.all([
        previewAResponse.json(), previewBResponse.json(),
      ]) as [
        { rows: Array<{ disposition: string }>; previewToken: string },
        { rows: Array<{ disposition: string }> },
      ];
      assert.equal(previewA.rows[0].disposition, "duplicate");
      assert.equal(previewB.rows[0].disposition, "ready");
      const crossAccountConfirm = await call("/api/books/import/confirm", tokenB, {
        method: "POST",
        body: JSON.stringify({ rows, previewToken: previewA.previewToken }),
      });
      assert.equal(crossAccountConfirm.status, 409);
    });

    await t.test("foreign book IDs cannot be opened, edited, deleted, or starred", async () => {
      assert.equal((await call(`/api/books/${bookA.id}`, tokenB)).status, 404);
      assert.equal((await call(`/api/books/${bookB.id}`, tokenA)).status, 404);
      assert.equal((await call(`/api/books/${bookA.id}`, tokenB, {
        method: "PATCH", body: JSON.stringify({ title: "Hijacked by B" }),
      })).status, 404);
      assert.equal((await call(`/api/books/${bookA.id}`, tokenB, { method: "DELETE" })).status, 404);
      assert.equal((await call(`/api/books/${bookA.id}/star`, tokenB, {
        method: "PUT", body: JSON.stringify({ starred: true }),
      })).status, 404);
      assert.equal((await call(`/api/books/${bookA.id}/star`, tokenB, {
        method: "PUT", body: JSON.stringify({ starred: false }),
      })).status, 404);

      const ownerAAfterAttempts = await call(`/api/books/${bookA.id}`, tokenA);
      const ownerBAfterAttempts = await call(`/api/books/${bookB.id}`, tokenB);
      assert.equal(ownerAAfterAttempts.status, 200);
      assert.equal(ownerBAfterAttempts.status, 200);
      const [ownerARecord, ownerBRecord] = await Promise.all([
        ownerAAfterAttempts.json(), ownerBAfterAttempts.json(),
      ]) as [{ title: string; notes: string | null; starred: boolean }, { title: string; notes: string | null; starred: boolean }];
      assert.equal(ownerARecord.title, titleA);
      assert.equal(ownerARecord.notes, "A private note");
      assert.equal(ownerARecord.starred, true);
      assert.equal(ownerBRecord.title, titleB);
      assert.equal(ownerBRecord.notes, "B private note");
      assert.equal(ownerBRecord.starred, false);
    });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.delete(usersTable).where(inArray(usersTable.id, users.map(user => user.id)));
    await db.delete(booksTable).where(inArray(booksTable.title, [titleA, titleB]));
    await db.delete(authorsTable).where(inArray(authorsTable.displayName, [authorA, authorB]));
    await db.delete(genresTable).where(inArray(genresTable.name, [genreA, genreB]));
  }
});
