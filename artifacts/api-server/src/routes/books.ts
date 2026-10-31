import { and, eq } from "drizzle-orm";
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
  db,
  readingLogTable,
  starsTable,
  usersTable,
} from "@workspace/db";
import { createLibraryBook, getLibraryBook, listLibraryBooks, toApiBook, updateLibraryBook } from "../lib/library";
import { normalizeBookInput } from "../lib/book-validation";
import { findLibraryBooks } from "../lib/book-search";
import { computeDashboardSummary } from "../lib/dashboard-summary";
import { pickNextLibraryBook } from "../lib/book-picker";

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

router.get("/books", requireAuth, async (req, res): Promise<void> => {
  const query = { ...req.query };
  // Avoid JavaScript's Boolean("false") === true coercion in query validators.
  for (const field of ["starredOnly", "isOwned"]) {
    if (query[field] !== undefined && query[field] !== "true" && query[field] !== "false") {
      res.status(400).json({ error: `${field} must be true or false.` });
      return;
    }
  }
  const parsed = ListBooksQueryParams.safeParse({
    ...query,
    ...(query.starredOnly !== undefined ? { starredOnly: query.starredOnly === "true" } : {}),
    ...(query.isOwned !== undefined ? { isOwned: query.isOwned === "true" } : {}),
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = await resolveUserId(res.locals.clerkUserId as string);
  const starredIds = await listStarredBookIds(userId);
  const rows = findLibraryBooks(await listLibraryBooks(userId), parsed.data, starredIds);

  res.json(ListBooksResponse.parse(rows.map((book) => toApiBook(book, starredIds))));
});

router.post("/books", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateBookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let input;
  try {
    input = normalizeBookInput(parsed.data);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }
  const userId = await resolveUserId(res.locals.clerkUserId as string);
  const book = await createLibraryBook(userId, input);
  res.status(201).json(CreateBookResponse.parse(toApiBook(book, new Set())));
});

router.get("/books/export", requireAuth, async (_req, res): Promise<void> => {
  const userId = await resolveUserId(res.locals.clerkUserId as string);
  const books = await listLibraryBooks(userId);
  books.sort((a, b) => a.title.localeCompare(b.title));
  res.json(ExportBooksResponse.parse(books.map((book) => toApiBook(book, new Set()))));
});

router.get("/books/next", requireAuth, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const parsed = PickNextBookQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = await resolveUserId(res.locals.clerkUserId as string);
  const selected = pickNextLibraryBook(await listLibraryBooks(userId), parsed.data);
  if (!selected) {
    res.json(PickNextBookResponse.parse({ book: null }));
    return;
  }
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
  const book = await getLibraryBook(userId, parsed.data.id);
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
  const current = await getLibraryBook(userId, params.data.id);
  if (!current) {
    res.status(404).json({ error: "Book not found." });
    return;
  }
  let input;
  try {
    input = normalizeBookInput({
      ...current, author: current.authors.join(", "), ...body.data,
      authors: body.data.authors ?? (body.data.author !== undefined ? [body.data.author] : current.authors),
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }
  const catalogChanged = ["title", "author", "authors", "genre", "pages", "publishedYear", "isbn", "description", "coverUrl", "openLibraryId"]
    .some((field) => Object.prototype.hasOwnProperty.call(body.data, field));
  const book = await updateLibraryBook(userId, params.data.id, input, catalogChanged);
  if (!book) {
    res.status(404).json({ error: "Book not found." });
    return;
  }
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
    .delete(readingLogTable)
    .where(and(eq(readingLogTable.id, parsed.data.id), eq(readingLogTable.userId, userId)))
    .returning({ id: readingLogTable.id });
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
  const book = await getLibraryBook(userId, params.data.id);
  if (!book) {
    res.status(404).json({ error: "Book not found." });
    return;
  }
  if (body.data.starred) {
    await db
      .insert(starsTable)
      .values({ userId, bookId: book.catalogBookId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(starsTable)
      .where(
        and(
          eq(starsTable.userId, userId),
          eq(starsTable.bookId, book.catalogBookId),
        ),
      );
  }
  const starredIds = await listStarredBookIds(userId);
  res.json(SetBookStarResponse.parse(toApiBook(book, starredIds)));
});

router.get("/dashboard/summary", requireAuth, async (_req, res): Promise<void> => {
  const userId = await resolveUserId(res.locals.clerkUserId as string);
  const rows = await listLibraryBooks(userId);
  const starredIds = await listStarredBookIds(userId);
  const summary = computeDashboardSummary(rows, starredIds);
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
