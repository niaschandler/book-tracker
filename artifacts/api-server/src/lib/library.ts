import { and, eq, sql } from "drizzle-orm";
import {
  authorsTable, bookAuthorsTable, booksTable, db, genresTable,
  readingLogTable, type BookStatus,
} from "@workspace/db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface LibraryInput {
  title: string;
  authors: string[];
  genre: string | null;
  pages: number | null;
  publishedYear: number | null;
  isbn: string | null;
  description: string | null;
  coverUrl: string | null;
  openLibraryId: string | null;
  status: BookStatus;
  isOwned: boolean;
  rating: number | null;
  startedOn: string | null;
  finishedOn: string | null;
  notes: string | null;
  moodTags: string[];
}

// The API's stable id is a private reading_log id, not a global catalog id.
const selection = {
  id: readingLogTable.id,
  catalogBookId: booksTable.id,
  title: booksTable.title,
  authors: sql<string[]>`ARRAY(
    SELECT a.display_name FROM book_authors ba
    JOIN authors a ON a.id = ba.author_id
    WHERE ba.book_id = ${booksTable.id} ORDER BY ba.position, ba.author_id
  )`,
  genre: genresTable.name,
  pages: booksTable.pages,
  publishedYear: booksTable.publishedYear,
  isbn: booksTable.isbn,
  description: booksTable.description,
  coverUrl: booksTable.coverUrl,
  openLibraryId: booksTable.openLibraryId,
  status: readingLogTable.status,
  isOwned: readingLogTable.isOwned,
  rating: readingLogTable.rating,
  startedOn: readingLogTable.startedOn,
  finishedOn: readingLogTable.finishedOn,
  notes: readingLogTable.notes,
  moodTags: readingLogTable.moodTags,
  createdAt: readingLogTable.createdAt,
  updatedAt: readingLogTable.updatedAt,
};

export async function listLibraryBooks(userId: number) {
  return db.select(selection).from(readingLogTable)
    .innerJoin(booksTable, eq(booksTable.id, readingLogTable.bookId))
    .leftJoin(genresTable, eq(genresTable.id, booksTable.genreId))
    .where(eq(readingLogTable.userId, userId));
}

export async function getLibraryBook(userId: number, id: number) {
  const [row] = await db.select(selection).from(readingLogTable)
    .innerJoin(booksTable, eq(booksTable.id, readingLogTable.bookId))
    .leftJoin(genresTable, eq(genresTable.id, booksTable.genreId))
    .where(and(eq(readingLogTable.userId, userId), eq(readingLogTable.id, id)));
  return row ?? null;
}
export type LibraryBook = Awaited<ReturnType<typeof listLibraryBooks>>[number];

export function toApiBook(book: LibraryBook, starredIds: Set<number>) {
  const { catalogBookId, ...record } = book;
  return {
    ...record, author: record.authors.join(", "),
    starred: starredIds.has(catalogBookId),
    createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
  };
}

async function catalogValues(tx: Transaction, input: LibraryInput) {
  let genreId: number | null = null;
  if (input.genre) {
    const [genre] = await tx.insert(genresTable).values({ name: input.genre })
      .onConflictDoUpdate({ target: genresTable.name, set: { name: input.genre } }).returning();
    genreId = genre.id;
  }
  return {
    title: input.title, genreId, pages: input.pages, publishedYear: input.publishedYear,
    isbn: input.isbn, description: input.description, coverUrl: input.coverUrl,
    openLibraryId: input.openLibraryId,
  };
}

async function setAuthors(tx: Transaction, bookId: number, names: string[]) {
  await tx.delete(bookAuthorsTable).where(eq(bookAuthorsTable.bookId, bookId));
  for (const [position, displayName] of names.entries()) {
    const [author] = await tx.insert(authorsTable).values({ displayName })
      .onConflictDoUpdate({ target: authorsTable.displayName, set: { displayName } }).returning();
    await tx.insert(bookAuthorsTable).values({ bookId, authorId: author.id, position });
  }
}

function personalValues(input: LibraryInput) {
  return {
    status: input.status, isOwned: input.isOwned, rating: input.rating,
    startedOn: input.startedOn, finishedOn: input.finishedOn,
    notes: input.notes, moodTags: input.moodTags,
  };
}

export async function createLibraryBook(userId: number, input: LibraryInput) {
  const id = await db.transaction(async (tx) => {
    // No title/ISBN deduplication: editions and private manual entries must not
    // be silently combined just because their visible titles happen to match.
    const [book] = await tx.insert(booksTable).values(await catalogValues(tx, input)).returning();
    await setAuthors(tx, book.id, input.authors);
    const [log] = await tx.insert(readingLogTable)
      .values({ userId, bookId: book.id, ...personalValues(input) }).returning();
    return log.id;
  });
  return (await getLibraryBook(userId, id))!;
}

export async function updateLibraryBook(userId: number, id: number, input: LibraryInput, catalogChanged: boolean) {
  const updated = await db.transaction(async (tx) => {
    const [log] = await tx.select().from(readingLogTable)
      .where(and(eq(readingLogTable.id, id), eq(readingLogTable.userId, userId))).for("update");
    if (!log) return false;
    let bookId = log.bookId;
    if (catalogChanged) {
      await tx.select({ id: booksTable.id }).from(booksTable).where(eq(booksTable.id, bookId)).for("update");
      const references = await tx.select({ id: readingLogTable.id }).from(readingLogTable)
        .where(eq(readingLogTable.bookId, bookId)).limit(2);
      const values = await catalogValues(tx, input);
      if (references.length > 1) {
        // Copy-on-write: changing metadata must never alter another reader's library.
        const [copy] = await tx.insert(booksTable).values(values).returning();
        bookId = copy.id;
      } else {
        await tx.update(booksTable).set({ ...values, updatedAt: new Date() }).where(eq(booksTable.id, bookId));
      }
      await setAuthors(tx, bookId, input.authors);
    }
    // Composite FK updates existing stars automatically if catalogBookId changed.
    await tx.update(readingLogTable).set({ ...personalValues(input), bookId, updatedAt: new Date() })
      .where(and(eq(readingLogTable.id, id), eq(readingLogTable.userId, userId)));
    return true;
  });
  return updated ? getLibraryBook(userId, id) : null;
}
