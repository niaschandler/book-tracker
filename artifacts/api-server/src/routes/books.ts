import { and, arrayContains, asc, desc, eq, ilike, inArray, lte, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { Router, type IRouter, type RequestHandler } from "express";
import {
  CreateBookBody,
  CreateBookResponse,
  DeleteBookParams,
  EnsureCurrentUserResponse,
  GetBookParams,
  GetBookResponse,
  GetDashboardSummaryResponse,
  ListBooksQueryParams,
  ListBooksResponse,
  PickNextBookQueryParams,
  PickNextBookResponse,
  SearchCatalogQueryParams,
  SearchCatalogResponse,
  SetBookStarBody,
  SetBookStarParams,
  SetBookStarResponse,
  UpdateBookBody,
  UpdateBookParams,
  UpdateBookResponse,
  ExportBooksResponse,
} from "@workspace/api-zod";
import {
  booksTable,
  db,
  starsTable,
  usersTable,
  type Book,
  type InsertBook,
} from "@workspace/db";

const router: IRouter = Router();

const requireAuth: RequestHandler = (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.locals.clerkUserId = userId;
  next();
};

async function resolveUserId(clerkUserId: string): Promise<number> {
  const [inserted] = await db
    .insert(usersTable)
    .values({ clerkUserId })
    .onConflictDoNothing({ target: usersTable.clerkUserId })
    .returning({ id: usersTable.id });
  if (inserted) return inserted.id;

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId));
  if (!existing) throw new Error("Could not resolve the signed-in user.");
  return existing.id;
}

router.put("/users/me", requireAuth, async (_req, res): Promise<void> => {
  await resolveUserId(res.locals.clerkUserId as string);
  res.json(EnsureCurrentUserResponse.parse({ ready: true }));
});

async function listStarredBookIds(userId: number): Promise<Set<number>> {
  const rows = await db
    .select({ bookId: starsTable.bookId })
    .from(starsTable)
    .where(eq(starsTable.userId, userId));
  return new Set(rows.map((row) => row.bookId));
}

function toApiBook(book: Book, starredIds: Set<number>) {
  return { ...book, starred: starredIds.has(book.id) };
}

async function getOwnedBook(userId: number, id: number): Promise<Book | null> {
  const [book] = await db
    .select()
    .from(booksTable)
    .where(and(eq(booksTable.id, id), eq(booksTable.userId, userId)))
    .limit(1);
  return book ?? null;
}

function normalizeBookInput(
  input: ReturnType<typeof CreateBookBody.parse>,
  userId: number,
): InsertBook {
  return {
    userId,
    title: input.title.trim(),
    author: input.author.trim(),
    genre: input.genre?.trim() || null,
    pages: input.pages ?? null,
    rating: input.rating ?? null,
    status: input.status,
    moodTags: (input.moodTags ?? []).map((tag) => tag.trim()).filter(Boolean),
    coverUrl: input.coverUrl ?? null,
    openLibraryId: input.openLibraryId ?? null,
    publishedYear: input.publishedYear ?? null,
    notes: input.notes ?? null,
    startedOn: input.startedOn ?? null,
    finishedOn: input.finishedOn ?? null,
  };
}

router.get("/books", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListBooksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = await resolveUserId(res.locals.clerkUserId as string);
  const filters = [eq(booksTable.userId, userId)];
  if (parsed.data.search?.trim()) {
    const term = `%${parsed.data.search.trim()}%`;
    filters.push(sql`(${ilike(booksTable.title, term)} OR ${ilike(booksTable.author, term)})`);
  }
  if (parsed.data.status) filters.push(eq(booksTable.status, parsed.data.status));
  if (parsed.data.genre) filters.push(eq(booksTable.genre, parsed.data.genre));

  const starredIds = await listStarredBookIds(userId);
  if (parsed.data.starredOnly) {
    if (starredIds.size === 0) {
      res.json(ListBooksResponse.parse([]));
      return;
    }
    filters.push(inArray(booksTable.id, [...starredIds]));
  }

  const sort = parsed.data.sort ?? "newest";
  const orderBy =
    sort === "title"
      ? asc(booksTable.title)
      : sort === "rating"
        ? desc(booksTable.rating)
        : sort === "pages"
          ? desc(booksTable.pages)
          : desc(booksTable.createdAt);
  const rows = await db
    .select()
    .from(booksTable)
    .where(and(...filters))
    .orderBy(orderBy, asc(booksTable.id));

  res.json(ListBooksResponse.parse(rows.map((book) => toApiBook(book, starredIds))));
});

router.post("/books", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateBookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!parsed.data.title.trim() || !parsed.data.author.trim()) {
    res.status(400).json({ error: "Title and author are required." });
    return;
  }

  const userId = await resolveUserId(res.locals.clerkUserId as string);
  const [book] = await db
    .insert(booksTable)
    .values(normalizeBookInput(parsed.data, userId))
    .returning();
  res.status(201).json(CreateBookResponse.parse({ ...book, starred: false }));
});

router.get("/books/export", requireAuth, async (_req, res): Promise<void> => {
  const userId = await resolveUserId(res.locals.clerkUserId as string);
  const books = await db
    .select({
      title: booksTable.title,
      author: booksTable.author,
      genre: booksTable.genre,
      pages: booksTable.pages,
      rating: booksTable.rating,
      status: booksTable.status,
      moodTags: booksTable.moodTags,
      notes: booksTable.notes,
      startedOn: booksTable.startedOn,
      finishedOn: booksTable.finishedOn,
    })
    .from(booksTable)
    .where(eq(booksTable.userId, userId))
    .orderBy(asc(booksTable.title));
  res.json(ExportBooksResponse.parse(books));
});

router.get("/books/next", requireAuth, async (req, res): Promise<void> => {
  const parsed = PickNextBookQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = await resolveUserId(res.locals.clerkUserId as string);
  const filters = [
    eq(booksTable.userId, userId),
    eq(booksTable.status, "want_to_read"),
  ];
  if (parsed.data.genre) filters.push(eq(booksTable.genre, parsed.data.genre));
  if (parsed.data.maxPages) filters.push(lte(booksTable.pages, parsed.data.maxPages));
  if (parsed.data.moodTag) {
    filters.push(arrayContains(booksTable.moodTags, [parsed.data.moodTag]));
  }

  const matches = await db.select().from(booksTable).where(and(...filters));
  if (matches.length === 0) {
    res.json(PickNextBookResponse.parse({ book: null }));
    return;
  }
  const selected = matches[Math.floor(Math.random() * matches.length)];
  const starredIds = await listStarredBookIds(userId);
  res.json(PickNextBookResponse.parse({ book: toApiBook(selected, starredIds) }));
});

router.get("/books/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetBookParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = await resolveUserId(res.locals.clerkUserId as string);
  const book = await getOwnedBook(userId, parsed.data.id);
  if (!book) {
    res.status(404).json({ error: "Book not found." });
    return;
  }
  const starredIds = await listStarredBookIds(userId);
  res.json(GetBookResponse.parse(toApiBook(book, starredIds)));
});

router.patch("/books/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateBookParams.safeParse(req.params);
  const body = UpdateBookBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (body.data.title !== undefined && !body.data.title.trim()) {
    res.status(400).json({ error: "Title cannot be blank." });
    return;
  }
  if (body.data.author !== undefined && !body.data.author.trim()) {
    res.status(400).json({ error: "Author cannot be blank." });
    return;
  }
  const userId = await resolveUserId(res.locals.clerkUserId as string);
  const current = await getOwnedBook(userId, params.data.id);
  if (!current) {
    res.status(404).json({ error: "Book not found." });
    return;
  }
  const patch = {
    ...body.data,
    ...(body.data.title !== undefined ? { title: body.data.title.trim() } : {}),
    ...(body.data.author !== undefined ? { author: body.data.author.trim() } : {}),
    ...(body.data.genre !== undefined
      ? { genre: body.data.genre?.trim() || null }
      : {}),
    ...(body.data.moodTags !== undefined
      ? {
          moodTags: body.data.moodTags.map((tag) => tag.trim()).filter(Boolean),
        }
      : {}),
    updatedAt: new Date(),
  };
  const [book] = await db
    .update(booksTable)
    .set(patch)
    .where(and(eq(booksTable.id, params.data.id), eq(booksTable.userId, userId)))
    .returning();
  const starredIds = await listStarredBookIds(userId);
  res.json(UpdateBookResponse.parse(toApiBook(book, starredIds)));
});

router.delete("/books/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = DeleteBookParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = await resolveUserId(res.locals.clerkUserId as string);
  const [deleted] = await db
    .delete(booksTable)
    .where(and(eq(booksTable.id, parsed.data.id), eq(booksTable.userId, userId)))
    .returning({ id: booksTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Book not found." });
    return;
  }
  res.sendStatus(204);
});

router.put("/books/:id/star", requireAuth, async (req, res): Promise<void> => {
  const params = SetBookStarParams.safeParse(req.params);
  const body = SetBookStarBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const userId = await resolveUserId(res.locals.clerkUserId as string);
  const book = await getOwnedBook(userId, params.data.id);
  if (!book) {
    res.status(404).json({ error: "Book not found." });
    return;
  }
  if (body.data.starred) {
    await db
      .insert(starsTable)
      .values({ userId, bookId: book.id })
      .onConflictDoNothing();
  } else {
    await db
      .delete(starsTable)
      .where(
        and(
          eq(starsTable.userId, userId),
          eq(starsTable.bookId, book.id),
        ),
      );
  }
  const starredIds = await listStarredBookIds(userId);
  res.json(SetBookStarResponse.parse(toApiBook(book, starredIds)));
});

router.get("/dashboard/summary", requireAuth, async (_req, res): Promise<void> => {
  const userId = await resolveUserId(res.locals.clerkUserId as string);
  const rows = await db
    .select()
    .from(booksTable)
    .where(eq(booksTable.userId, userId));
  const readBooks = rows.filter((book) => book.status === "read");
  const rated = readBooks.filter((book) => book.rating !== null);
  const totalPagesRead = readBooks.reduce((sum, book) => sum + (book.pages ?? 0), 0);
  const genreCounts = new Map<string, number>();
  for (const book of readBooks) {
    if (book.genre) genreCounts.set(book.genre, (genreCounts.get(book.genre) ?? 0) + 1);
  }
  const currentMonth = new Date().toISOString().slice(0, 7);
  const datedReads = readBooks
    .filter((book) => book.startedOn && book.finishedOn)
    .map((book) => ({
      book,
      days: Math.max(
        0,
        Math.ceil(
          (new Date(`${book.finishedOn}T00:00:00Z`).getTime() -
            new Date(`${book.startedOn}T00:00:00Z`).getTime()) /
            86_400_000,
        ),
      ),
    }))
    .sort((a, b) => a.days - b.days);
  const longestReadBook = readBooks
    .filter((book) => book.pages !== null)
    .sort((a, b) => (b.pages ?? 0) - (a.pages ?? 0))[0];
  const starredIds = await listStarredBookIds(userId);
  const summary = {
    totalBooks: rows.length,
    readCount: readBooks.length,
    ownedCount: rows.filter((book) => book.status === "owned").length,
    wantToReadCount: rows.filter((book) => book.status === "want_to_read").length,
    totalPagesRead,
    averageRating:
      rated.length > 0
        ? rated.reduce((sum, book) => sum + (book.rating ?? 0), 0) / rated.length
        : null,
    genreBreakdown: [...genreCounts.entries()]
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    longestReadBook: longestReadBook
      ? toApiBook(longestReadBook, starredIds)
      : null,
    fastestReadBook: datedReads[0]
      ? toApiBook(datedReads[0].book, starredIds)
      : null,
    fastestReadingDays: datedReads[0]?.days ?? null,
    monthlyReadCount: readBooks.filter(
      (book) => book.finishedOn?.startsWith(currentMonth),
    ).length,
  };
  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/catalog/search", requireAuth, async (req, res): Promise<void> => {
  const parsed = SearchCatalogQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const query = parsed.data.q.trim();
  if (query.length < 2) {
    res.status(400).json({ error: "Enter at least two characters to search." });
    return;
  }

  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", query);
  url.searchParams.set(
    "fields",
    "key,title,author_name,first_publish_year,number_of_pages_median,cover_i,subject",
  );
  url.searchParams.set("limit", "10");

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      res.status(502).json({ error: "Open Library search is temporarily unavailable." });
      return;
    }
    const result = (await response.json()) as {
      docs?: Array<{
        key?: string;
        title?: string;
        author_name?: string[];
        first_publish_year?: number;
        number_of_pages_median?: number;
        cover_i?: number;
        subject?: string[];
      }>;
    };
    const catalog = (result.docs ?? []).map((item) => ({
      key: item.key ?? "",
      title: item.title ?? "Untitled",
      author: item.author_name?.[0] ?? "Unknown author",
      genre: item.subject?.[0] ?? null,
      pages: item.number_of_pages_median ?? null,
      coverUrl: item.cover_i
        ? `https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg`
        : null,
      publishedYear: item.first_publish_year ?? null,
    }));
    res.json(SearchCatalogResponse.parse(catalog));
  } catch (error) {
    req.log.warn({ err: error }, "Open Library search failed");
    res.status(502).json({ error: "Open Library search is temporarily unavailable." });
  }
});

export default router;
