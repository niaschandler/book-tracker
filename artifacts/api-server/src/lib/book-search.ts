import type { ListBooksQueryParams } from "@workspace/api-zod";
import type { LibraryBook } from "./library";

type Filters = ReturnType<typeof ListBooksQueryParams.parse>;
type SearchableBook = Pick<LibraryBook,
  "id" | "catalogBookId" | "title" | "authors" | "status" | "genre" |
  "isOwned" | "rating" | "pages" | "createdAt">;

/** Input must already be scoped to the authenticated reader's library. */
export function findLibraryBooks<T extends SearchableBook>(
  books: T[], filters: Filters, starredIds: Set<number>,
): T[] {
  const terms = filters.search?.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean) ?? [];
  const rows = books.filter(book => {
    const text = `${book.title} ${book.authors.join(" ")}`.toLocaleLowerCase();
    return terms.every(term => text.includes(term)) &&
      (!filters.status || book.status === filters.status) &&
      (!filters.genre || book.genre === filters.genre) &&
      (filters.isOwned === undefined || book.isOwned === filters.isOwned) &&
      (!filters.starredOnly || starredIds.has(book.catalogBookId));
  });
  const sort = filters.sort ?? "newest";
  return rows.sort((a, b) => (
    sort === "title" ? a.title.localeCompare(b.title) :
    sort === "rating" ? (b.rating ?? -1) - (a.rating ?? -1) :
    sort === "pages" ? (b.pages ?? -1) - (a.pages ?? -1) :
    b.createdAt.getTime() - a.createdAt.getTime()
  ) || a.id - b.id);
}
