import type { CreateBookBody } from "@workspace/api-zod";
import type { LibraryInput } from "./library";

type Input = ReturnType<typeof CreateBookBody.parse>;

function validDate(value: string | null) {
  if (value === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Also used after merging a PATCH with its current private record. */
export function normalizeBookInput(input: Input): LibraryInput {
  const authors = [...new Set((input.authors ?? [input.author]).map((name) => name.trim()))];
  if (!input.title.trim() || authors.length === 0 || authors.some((name) => !name || name.length > 240)) {
    throw new Error("A title and at least one author name are required (240 characters per author).");
  }
  const startedOn = input.startedOn ?? null;
  const finishedOn = input.finishedOn ?? null;
  if (!validDate(startedOn) || !validDate(finishedOn)) {
    throw new Error("Reading dates must be valid calendar dates in YYYY-MM-DD format.");
  }
  if (startedOn && finishedOn && finishedOn < startedOn) {
    throw new Error("The finished date cannot be before the started date.");
  }
  return {
    title: input.title.trim(), authors, genre: input.genre?.trim() || null,
    pages: input.pages ?? null, publishedYear: input.publishedYear ?? null,
    isbn: input.isbn?.trim() || null, description: input.description?.trim() || null,
    coverUrl: input.coverUrl ?? null, openLibraryId: input.openLibraryId ?? null,
    status: input.status, isOwned: input.isOwned ?? false, rating: input.rating ?? null,
    startedOn, finishedOn, notes: input.notes ?? null,
    moodTags: [...new Set((input.moodTags ?? []).map((tag) => tag.trim()).filter(Boolean))],
  };
}
