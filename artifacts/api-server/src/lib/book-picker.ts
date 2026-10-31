import type { PickNextBookQueryParams } from "@workspace/api-zod";
import type { LibraryBook } from "./library";

type Filters = ReturnType<typeof PickNextBookQueryParams.parse>;
type PickableBook = Pick<LibraryBook, "status" | "genre" | "pages" | "moodTags">;
const normalized = (text: string | null | undefined) => text?.trim().toLocaleLowerCase() || "";

/** The caller must supply only the authenticated user's library. */
export function pickNextLibraryBook<T extends PickableBook>(
  books: readonly T[], filters: Filters, random: () => number = Math.random,
): T | null {
  const genre = normalized(filters.genre);
  const excludeGenre = normalized(filters.excludeGenre);
  const mood = normalized(filters.moodTag);
  const matches = books.filter(book => {
    const bookGenre = normalized(book.genre);
    return book.status === "want_to_read" &&
      (!genre || bookGenre === genre) &&
      (!excludeGenre || (!!bookGenre && bookGenre !== excludeGenre)) &&
      (filters.maxPages === undefined || (book.pages !== null && book.pages <= filters.maxPages)) &&
      (!mood || book.moodTags.some(tag => normalized(tag) === mood));
  });
  return matches.length ? matches[Math.floor(random() * matches.length)] : null;
}
