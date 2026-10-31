import { toApiBook, type LibraryBook } from "./library";

function calendarTime(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

/** Call only with records from the authenticated reader's library. */
export function computeDashboardSummary(
  books: LibraryBook[], starredIds: Set<number>, now = new Date(),
) {
  const read = books.filter(book => book.status === "read");
  const rated = read.filter(book => book.rating !== null);
  const genreCounts = new Map<string, number>();
  for (const book of read) {
    const genre = book.genre?.trim() || "Uncategorized";
    genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
  }
  const longest = read.filter(book => book.pages !== null)
    .sort((a, b) => (b.pages ?? 0) - (a.pages ?? 0) || a.id - b.id)[0];
  const dated = read.flatMap(book => {
    const start = calendarTime(book.startedOn);
    const finish = calendarTime(book.finishedOn);
    return start !== null && finish !== null && finish >= start
      ? [{ book, days: (finish - start) / 86_400_000 }]
      : [];
  }).sort((a, b) => a.days - b.days || a.book.id - b.book.id);
  const month = now.toISOString().slice(0, 7);
  return {
    totalBooks: books.length,
    readCount: read.length,
    ownedCount: books.filter(book => book.isOwned).length,
    wantToReadCount: books.filter(book => book.status === "want_to_read").length,
    totalPagesRead: read.reduce((sum, book) => sum + (book.pages ?? 0), 0),
    averageRating: rated.length
      ? rated.reduce((sum, book) => sum + (book.rating ?? 0), 0) / rated.length
      : null,
    genreBreakdown: [...genreCounts].map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre)),
    longestReadBook: longest ? toApiBook(longest, starredIds) : null,
    fastestReadBook: dated[0] ? toApiBook(dated[0].book, starredIds) : null,
    fastestReadingDays: dated[0]?.days ?? null,
    monthlyReadCount: read.filter(book =>
      calendarTime(book.finishedOn) !== null && book.finishedOn?.startsWith(month),
    ).length,
  };
}
