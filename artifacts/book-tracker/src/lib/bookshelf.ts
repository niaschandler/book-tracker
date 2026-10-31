export type ShelfBookLike = { id: number; title: string; status: string; isOwned?: boolean; pages?: number | null; finishedOn?: string | null; createdAt: string };

export type ShelfGroup<T> = { key: string; label: string; books: T[] };

/** Only finished (status === 'read') records; ownership is irrelevant. */
export function finishedBooks<T extends ShelfBookLike>(books: readonly T[] | undefined | null): T[] {
  return (books ?? []).filter((b) => b.status === 'read');
}

function finishedYear(b: ShelfBookLike): number | null {
  if (!b.finishedOn) return null;
  const t = Date.parse(b.finishedOn);
  const date = b.finishedOn.slice(0, 10);
  return Number.isFinite(t) && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
    ? new Date(t).getUTCFullYear() : null;
}

/** Groups finished books into shelves by year finished (newest first); undated books go last. */
export function groupShelves<T extends ShelfBookLike>(books: readonly T[] | undefined | null): ShelfGroup<T>[] {
  const map = new Map<number | null, T[]>();
  for (const b of finishedBooks(books)) {
    const y = finishedYear(b);
    const list = map.get(y) ?? [];
    list.push(b);
    map.set(y, list);
  }
  const time = (b: T) => Date.parse(b.finishedOn ?? '') || Date.parse(b.createdAt) || 0;
  return [...map.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : b - a))
    .map(([y, list]) => ({
      key: y === null ? 'undated' : String(y),
      label: y === null ? 'Finish date not recorded' : `Finished in ${y}`,
      books: [...list].sort((x, z) => time(z) - time(x)),
    }));
}

export type ShelfStats = { count: number; pagesKnown: number; booksWithPages: number; booksWithoutPages: number };

/** Bought books stay separate until finished; borrowed wish-list items do not belong here. */
export function bookshelfGroups<T extends ShelfBookLike>(books: readonly T[] | undefined | null): ShelfGroup<T>[] {
  const bought = (books ?? []).filter(b => b.isOwned === true && b.status !== 'read')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id - b.id);
  return [...groupShelves(books), { key: 'bought-unread', label: 'Bought, not yet read', books: bought }];
}

export function shelfStats(books: readonly ShelfBookLike[] | undefined | null): ShelfStats {
  const read = finishedBooks(books);
  const withPages = read.filter((b) => typeof b.pages === 'number' && b.pages > 0);
  return {
    count: read.length,
    pagesKnown: withPages.reduce((n, b) => n + (b.pages as number), 0),
    booksWithPages: withPages.length,
    booksWithoutPages: read.length - withPages.length,
  };
}

/** Deterministic spine dimensions: height varies by title, thickness by page count (unknown => medium). */
export function spineMetrics(b: Pick<ShelfBookLike, 'title' | 'pages' | 'id'>): { height: number; width: number; tone: number } {
  const seed = (b.title || '').split('').reduce((a, c) => a + c.charCodeAt(0), b.id);
  const pages = typeof b.pages === 'number' && b.pages > 0 ? b.pages : null;
  const width = pages ? Math.round(Math.min(64, Math.max(30, 26 + pages / 22))) : 40;
  return { height: 168 + (seed % 5) * 9, width, tone: seed % 6 };
}
