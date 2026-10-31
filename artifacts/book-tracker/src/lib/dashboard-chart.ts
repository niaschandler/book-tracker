export type MonthBucket = { key: string; label: string; longLabel: string; count: number };
type Finishable = { status: string; finishedOn?: string | null };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Finished books per UTC calendar month for the trailing `months` months ending at `now`'s UTC month. */
export function monthlyCompletions(books: readonly Finishable[], now: Date = new Date(), months = 12): { buckets: MonthBucket[]; undated: number } {
  const buckets: MonthBucket[] = [];
  const index = new Map<string, MonthBucket>();
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const b = { key, label: MONTHS[d.getUTCMonth()], longLabel: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`, count: 0 };
    buckets.push(b); index.set(key, b);
  }
  let undated = 0;
  for (const book of books) {
    if (book.status !== 'read') continue;
    const t = book.finishedOn ? Date.parse(book.finishedOn) : NaN;
    const dateOnly = book.finishedOn?.slice(0, 10);
    if (!Number.isFinite(t) || !dateOnly || !/^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ||
      new Date(`${dateOnly}T00:00:00Z`).toISOString().slice(0, 10) !== dateOnly) { undated++; continue; }
    const d = new Date(t);
    const b = index.get(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    if (b) b.count++;
  }
  return { buckets, undated };
}

export function namedGenreCount(genres: readonly { genre: string; count: number }[]): number {
  return genres.filter(g => g.count > 0 && !['uncategorized', 'unknown', ''].includes(g.genre.trim().toLowerCase())).length;
}

export function formatDays(days: number | null | undefined): string | null {
  if (days == null || !Number.isFinite(days) || days < 0) return null;
  if (days === 0) return 'Same day';
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
