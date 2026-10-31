import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { authorsTable, booksTable, db, pool, readingLogTable, starsTable, usersTable } from "@workspace/db";
import { createLibraryBook, listLibraryBooks } from "./library";
import { prepareImportRow, previewImport } from "./library-import";
import { confirmImport, StaleImportPreview } from "./library-import-commit";

after(async () => { await pool.end(); });

test("confirmed imports preserve other readers, current duplicates, ownership, stars, dates, and timestamps", async () => {
  const suffix = randomUUID();
  const owner = `import-owner-${suffix}`;
  const other = `import-other-${suffix}`;
  const author = `Import Writer ${suffix}`;
  const userIds: number[] = [];
  const bookIds: number[] = [];
  try {
    const users = await db.insert(usersTable).values([{ clerkUserId: owner }, { clerkUserId: other }]).returning();
    userIds.push(...users.map(user => user.id));
    const values = {
      title: `Shared book ${suffix}`, author, status: "reading", isOwned: "Yes", starred: "Yes",
      rating: "4", notes: "Private original", startedOn: "2026-01-01",
    };
    const original = await createLibraryBook(users[0].id, prepareImportRow(values).input);
    bookIds.push(original.catalogBookId);
    await db.insert(readingLogTable).values({
      userId: users[1].id, bookId: original.catalogBookId, notes: "Other reader's private notes", rating: 2,
    });
    await db.insert(starsTable).values({ userId: users[1].id, bookId: original.catalogBookId });
    const otherBefore = await listLibraryBooks(users[1].id);
    const sourceRows = [
      { row: 2, values: { ...values, notes: "Do not overwrite original" } },
      { row: 3, values: { ...values, title: `New book ${suffix}`, status: "read", finishedOn: "2026-01-05",
        createdAt: "2025-10-01T12:00:00.000Z", updatedAt: "2026-01-05T12:00:00.000Z", bookId: String(original.catalogBookId) } },
      { row: 4, values: { ...values, title: `New book ${suffix}` } },
      { row: 5, values: { ...values, title: "" } },
    ];
    const before = await listLibraryBooks(users[0].id);
    const { preview } = previewImport(sourceRows, before, owner);
    assert.deepEqual(await listLibraryBooks(users[0].id), before, "Preview does not write");
    assert.equal(preview.ready, 1);
    assert.equal(preview.duplicates, 2);
    assert.equal(preview.invalid, 1);
    const result = await confirmImport(owner, { rows: sourceRows, previewToken: preview.previewToken });
    assert.deepEqual(result, { imported: 1, skipped: 3 });
    const afterBooks = await listLibraryBooks(users[0].id);
    const added = afterBooks.find(book => book.title === `New book ${suffix}`)!;
    bookIds.push(added.catalogBookId);
    assert.equal(added.isOwned, true);
    assert.equal(added.status, "read");
    assert.equal(added.rating, 4);
    assert.equal(added.startedOn, "2026-01-01");
    assert.equal(added.finishedOn, "2026-01-05");
    assert.equal(added.createdAt.toISOString(), "2025-10-01T12:00:00.000Z");
    assert.equal(added.updatedAt.toISOString(), "2026-01-05T12:00:00.000Z");
    assert.equal(afterBooks.find(book => book.id === original.id)?.notes, "Private original");
    assert.deepEqual(await listLibraryBooks(users[1].id), otherBefore);
    assert.deepEqual((await db.select().from(starsTable).where(eq(starsTable.userId, users[0].id))).map(star => star.bookId), [added.catalogBookId]);
    assert.equal((await db.select().from(starsTable).where(eq(starsTable.userId, users[1].id))).length, 1);
    await assert.rejects(confirmImport(owner, { rows: sourceRows, previewToken: preview.previewToken }), StaleImportPreview);
    const second = previewImport(sourceRows, afterBooks, owner).preview;
    assert.equal(second.ready, 0);
    assert.deepEqual(await confirmImport(owner, { rows: sourceRows, previewToken: second.previewToken }), { imported: 0, skipped: 4 });

    // An identically named book in another reader's library is not a duplicate
    // for this reader and never causes a shared metadata update.
    const foreignOnly = await createLibraryBook(users[1].id, prepareImportRow({ title: `Foreign only ${suffix}`, author }).input);
    bookIds.push(foreignOnly.catalogBookId);
    const foreignRows = [{ row: 2, values: { title: foreignOnly.title, author, notes: "Only mine", starred: "No" } }];
    const foreignPreview = previewImport(foreignRows, afterBooks, owner).preview;
    assert.equal(foreignPreview.ready, 1);
    await confirmImport(owner, { rows: foreignRows, previewToken: foreignPreview.previewToken });
    const mine = (await listLibraryBooks(users[0].id)).find(book => book.title === foreignOnly.title)!;
    bookIds.push(mine.catalogBookId);
    assert.notEqual(mine.catalogBookId, foreignOnly.catalogBookId);
    assert.equal((await listLibraryBooks(users[1].id)).find(book => book.id === foreignOnly.id)?.notes, null);

    // Two concurrent confirms cannot insert the same batch twice.
    const concurrentRows = [{ row: 2, values: { title: `Concurrent ${suffix}`, author } }];
    const concurrentPreview = previewImport(concurrentRows, await listLibraryBooks(users[0].id), owner).preview;
    const attempts = await Promise.allSettled([1, 2].map(() => confirmImport(owner, {
      rows: concurrentRows, previewToken: concurrentPreview.previewToken,
    })));
    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
    const concurrent = (await listLibraryBooks(users[0].id)).filter(book => book.title === `Concurrent ${suffix}`);
    bookIds.push(...concurrent.map(book => book.catalogBookId));
    assert.equal(concurrent.length, 1);
  } finally {
    // Collect fixture-only rows even if an assertion above failed.
    for (const id of userIds) bookIds.push(...(await listLibraryBooks(id)).map(book => book.catalogBookId));
    if (userIds.length) await db.delete(usersTable).where(inArray(usersTable.id, userIds));
    if (bookIds.length) await db.delete(booksTable).where(inArray(booksTable.id, [...new Set(bookIds)]));
    await db.delete(authorsTable).where(eq(authorsTable.displayName, author));
  }
});

test("a stale confirmation for a new reader rolls back even local account creation", async () => {
  const owner = `import-stale-${randomUUID()}`;
  await assert.rejects(confirmImport(owner, {
    rows: [{ row: 2, values: { title: "Not inserted", author: "Not inserted" } }],
    previewToken: "0".repeat(64),
  }), StaleImportPreview);
  assert.equal((await db.select().from(usersTable).where(eq(usersTable.clerkUserId, owner))).length, 0);
});
