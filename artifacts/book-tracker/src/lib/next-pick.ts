import type { PickNextBookParams } from '@workspace/api-client-react';

export type PickFilters = { genre: string; excludeGenre: string; moodTag: string; maxPages: string };
export type PickParams = PickNextBookParams;
export type PickValidation = { ok: true; params: PickParams } | { ok: false; field: 'maxPages' | 'excludeGenre'; message: string };

export function validatePickFilters(f: PickFilters): PickValidation {
  const genre = f.genre.trim(), excludeGenre = f.excludeGenre.trim(), moodTag = f.moodTag.trim(), raw = f.maxPages.trim();
  if (genre && excludeGenre && genre.toLowerCase() === excludeGenre.toLowerCase())
    return { ok: false, field: 'excludeGenre', message: `You can't both include and skip ${genre}. Pick one, or clear the other.` };
  let maxPages: number | undefined;
  if (raw) {
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || !Number.isSafeInteger(Number(raw)))
      return { ok: false, field: 'maxPages', message: 'Page limit should be a whole number of 1 or more, like 300. Leave it empty for any length.' };
    maxPages = Number(raw);
  }
  const params: PickParams = {};
  if (genre) params.genre = genre;
  if (excludeGenre) params.excludeGenre = excludeGenre;
  if (moodTag) params.moodTag = moodTag;
  if (maxPages !== undefined) params.maxPages = maxPages;
  return { ok: true, params };
}

type Lite = { status: string; genre?: string | null; moodTags?: string[] | null };
export function pickOptions(books: Lite[] | undefined) {
  const want = (books ?? []).filter(b => b.status === 'want_to_read');
  const sort = (s: Iterable<string>) => Array.from(s).sort((a, b) => a.localeCompare(b));
  const genres = new Map<string, string>();
  want.forEach(b => { const g = b.genre?.trim(); if (g && !genres.has(g.toLowerCase())) genres.set(g.toLowerCase(), g); });
  const moods = new Map<string, string>();
  want.forEach(b => (b.moodTags ?? []).forEach(m => { const t = m.trim(); if (t && !moods.has(t.toLowerCase())) moods.set(t.toLowerCase(), t); }));
  return { count: want.length, genres: sort(genres.values()), moods: sort(moods.values()), noGenre: want.filter(b => !b.genre?.trim()).length };
}
