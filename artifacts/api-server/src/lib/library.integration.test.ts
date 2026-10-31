import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { authorsTable, booksTable, db, genresTable, pool, readingLogTable, starsTable, usersTable } from "@workspace/db";
import { createLibraryBook, getLibraryBook, listLibraryBooks, toApiBook, updateLibraryBook, type LibraryInput } from "./library";
import { normalizeBookInput } from "./book-validation";

// Development-only integration checks; all fixtures are isolated and removed.
after(async () => { await pool.end(); });

test("legacy migration preserves IDs, personal fields, authors, genre, and favorites", async () => {
  const client = await pool.connect();
  const schema = `migration_test_${randomUUID().replaceAll("-", "")}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}`);
    await client.query(`
      CREATE TYPE book_status AS ENUM ('want_to_read', 'owned', 'read');
      CREATE TABLE users(id serial PRIMARY KEY, clerk_user_id text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE books(
        id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id),
        title text NOT NULL, author text NOT NULL, genre text, pages integer, rating integer,
        status book_status NOT NULL, mood_tags text[] NOT NULL DEFAULT '{}',
        cover_url text, open_library_id text, published_year integer, notes text,
        started_on date, finished_on date, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT books_rating_range CHECK(rating IS NULL OR rating BETWEEN 1 AND 5),
        CONSTRAINT books_pages_positive CHECK(pages IS NULL OR pages > 0)
      );
      CREATE TABLE stars(user_id integer REFERENCES users(id), book_id integer REFERENCES books(id), created_at timestamptz DEFAULT now(), PRIMARY KEY(user_id,book_id));
      INSERT INTO users(clerk_user_id) VALUES ('migration_fixture');
      INSERT INTO books(id,user_id,title,author,genre,pages,rating,status,mood_tags,notes,started_on,finished_on)
        VALUES (41,1,'Migration fixture','Writer, Jr.','History',250,4,'owned',ARRAY['calm'],'Keep this note','2026-01-01','2026-01-07'),
               (42,1,'Read fixture','Second writer',NULL,NULL,NULL,'read','{}',NULL,NULL,NULL);
      INSERT INTO stars(user_id,book_id) VALUES (1,41);
    `);
    const migration = await readFile(new URL("../../../../lib/db/migrations/0001_relational_library.dev.sql", import.meta.url), "utf8");
    await client.query(migration.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, ""));
    const { rows } = await client.query(`SELECT l.*, a.display_name, g.name AS genre FROM reading_log l
      JOIN books b ON b.id=l.book_id JOIN book_authors ba ON ba.book_id=b.id
      JOIN authors a ON a.id=ba.author_id LEFT JOIN genres g ON g.id=b.genre_id ORDER BY l.id`);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 41);
    assert.equal(rows[0].book_id, 41);
    assert.equal(rows[0].status, "want_to_read");
    assert.equal(rows[0].is_owned, true);
    assert.equal(rows[0].rating, 4);
    assert.equal(rows[0].notes, "Keep this note");
    assert.deepEqual(rows[0].mood_tags, ["calm"]);
    assert.equal(rows[0].display_name, "Writer, Jr.");
    assert.equal(rows[0].genre, "History");
    assert.equal(rows[1].status, "read");
    assert.equal(rows[1].rating, null);
    assert.equal((await client.query("SELECT count(*) FROM stars")).rows[0].count, "1");
    assert.equal((await client.query("SELECT nextval(pg_get_serial_sequence('reading_log','id')) AS id")).rows[0].id, "43");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("private library CRUD, normalized relations, constraints, and shared-metadata isolation", async () => {
  const suffix = randomUUID();
  const names = [`Writer A ${suffix}`, `Writer B ${suffix}`];
  const genre = `Test genre ${suffix}`;
  const userIds: number[] = [];
  const bookIds: number[] = [];
  const input: LibraryInput = {
    title: `Relational fixture ${suffix}`, authors: names, genre, pages: 320,
    publishedYear: 2024, isbn: "978-0-123456-78-9", description: "Catalog description",
    coverUrl: null, openLibraryId: null, status: "read", isOwned: true, rating: 5,
    startedOn: "2026-01-01", finishedOn: "2026-01-03", notes: "Private A note", moodTags: ["calm"],
  };
  try {
    const users = await db.insert(usersTable).values([
      { clerkUserId: `integration-a-${suffix}` }, { clerkUserId: `integration-b-${suffix}` },
    ]).returning();
    userIds.push(...users.map((user) => user.id));
    const [a, b] = users;
    const created = await createLibraryBook(a.id, input);
    bookIds.push(created.catalogBookId);
    assert.deepEqual(created.authors, names);
    assert.equal(created.genre, genre);
    assert.equal(created.isOwned, true);
    assert.equal(created.status, "read");
    assert.equal(created.isbn, input.isbn);
    assert.equal((await listLibraryBooks(b.id)).length, 0);
    assert.equal(await getLibraryBook(b.id, created.id), null);
    assert.equal(await updateLibraryBook(b.id, created.id, input, true), null);
    assert.equal(toApiBook(created, new Set()).author, names.join(", "));
    assert.equal("catalogBookId" in toApiBook(created, new Set()), false);

    await assert.rejects(db.insert(starsTable).values({ userId: b.id, bookId: created.catalogBookId }));
    const [bLog] = await db.insert(readingLogTable).values({
      userId: b.id, bookId: created.catalogBookId, status: "want_to_read", rating: 2, notes: "Private B note",
    }).returning();
    await assert.rejects(db.insert(readingLogTable).values({ userId: b.id, bookId: created.catalogBookId }));
    await db.insert(starsTable).values(userIds.map((userId) => ({ userId, bookId: created.catalogBookId })));
    // One shared junction table: repeated starring is idempotent, and
    // unstarring by one reader never removes another reader's star.
    await db.insert(starsTable).values({ userId: a.id, bookId: created.catalogBookId }).onConflictDoNothing();
    assert.equal((await db.select().from(starsTable).where(eq(starsTable.userId, a.id))).length, 1);
    await db.delete(starsTable).where(and(eq(starsTable.userId, a.id), eq(starsTable.bookId, created.catalogBookId)));
    assert.equal((await db.select().from(starsTable).where(eq(starsTable.userId, a.id))).length, 0);
    assert.equal((await db.select().from(starsTable).where(eq(starsTable.userId, b.id))).length, 1);
    assert.ok(await getLibraryBook(a.id, created.id), "Unstarring must not delete the library entry");
    await db.insert(starsTable).values({ userId: a.id, bookId: created.catalogBookId });
    await assert.rejects(db.update(booksTable).set({ pages: 0 }).where(eq(booksTable.id, created.catalogBookId)));
    await assert.rejects(db.update(readingLogTable).set({ rating: 6 }).where(eq(readingLogTable.id, created.id)));
    await assert.rejects(db.update(readingLogTable).set({ finishedOn: "2025-01-01" }).where(eq(readingLogTable.id, created.id)));

    const personalEdit = await updateLibraryBook(a.id, created.id, { ...input, rating: 3 }, false);
    assert.equal(personalEdit?.catalogBookId, created.catalogBookId);
    assert.equal((await getLibraryBook(b.id, bLog.id))?.rating, 2);
    const changed = await updateLibraryBook(a.id, created.id, {
      ...input, title: "Changed only for A", authors: [names[1]], isOwned: false, rating: null, notes: null,
    }, true);
    assert.ok(changed);
    bookIds.push(changed.catalogBookId);
    assert.equal(changed.id, created.id);
    assert.notEqual(changed.catalogBookId, created.catalogBookId);
    assert.equal(changed.isOwned, false);
    assert.equal(changed.rating, null);
    assert.equal(changed.notes, null);
    assert.deepEqual(changed.authors, [names[1]]);
    const untouched = await getLibraryBook(b.id, bLog.id);
    assert.equal(untouched?.title, input.title);
    assert.equal(untouched?.notes, "Private B note");
    assert.deepEqual(untouched?.authors, names);
    const [aStar] = await db.select().from(starsTable).where(eq(starsTable.userId, a.id));
    assert.equal(aStar.bookId, changed.catalogBookId);
    await db.delete(readingLogTable).where(and(eq(readingLogTable.id, changed.id), eq(readingLogTable.userId, a.id)));
    assert.equal((await db.select().from(starsTable).where(eq(starsTable.userId, a.id))).length, 0);
    assert.equal((await db.select().from(starsTable).where(eq(starsTable.userId, b.id))).length, 1);
    assert.ok(await getLibraryBook(b.id, bLog.id));
  } finally {
    if (userIds.length) await db.delete(usersTable).where(inArray(usersTable.id, userIds));
    if (bookIds.length) await db.delete(booksTable).where(inArray(booksTable.id, bookIds));
    await db.delete(authorsTable).where(inArray(authorsTable.displayName, names));
    await db.delete(genresTable).where(eq(genresTable.name, genre));
  }
});

test("calendar dates, author names, and independent ownership normalize safely", () => {
  assert.throws(() => normalizeBookInput({ title: "Title", author: "Author", status: "read", startedOn: "2026-02-30" }));
  assert.throws(() => normalizeBookInput({ title: "Title", author: "Author", status: "read", startedOn: "2026-02-01", finishedOn: "2026-01-01" }));
  assert.throws(() => normalizeBookInput({ title: "Title", author: " ", status: "read" }));
  const input = normalizeBookInput({ title: " Title ", author: "Fallback", authors: [" First ", "Second", "First"], status: "read", isOwned: false });
  assert.equal(input.title, "Title");
  assert.deepEqual(input.authors, ["First", "Second"]);
  assert.equal(input.isOwned, false);
  assert.equal(input.rating, null);
});
