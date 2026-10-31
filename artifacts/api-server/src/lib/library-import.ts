import { createHash } from "node:crypto";
import { CreateBookBody, type LibraryImportRow } from "@workspace/api-zod";
import { normalizeBookInput } from "./book-validation";
import type { LibraryBook, LibraryInput } from "./library";

export interface PreparedImport {
  input: LibraryInput;
  starred: boolean;
  timestamps: { createdAt?: Date; updatedAt?: Date };
}

function parseBoolean(value: string | undefined, name: string) {
  if (!value?.trim()) return false;
  if (/^(yes|true|1)$/i.test(value.trim())) return true;
  if (/^(no|false|0)$/i.test(value.trim())) return false;
  throw new Error(`${name} must be Yes/No or true/false.`);
}

export function prepareImportRow(values: Record<string, string>): PreparedImport {
  const optional = (key: string) => values[key]?.trim() || null;
  const number = (key: string) => {
    const value = optional(key);
    if (value === null) return null;
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2_147_483_647) {
      throw new Error(`${key} must be a whole number no greater than 2,147,483,647.`);
    }
    return Number(value);
  };
  const list = (key: string): string[] | undefined => {
    const value = optional(key);
    if (!value) return undefined;
    let parsed: unknown;
    try { parsed = JSON.parse(value); } catch { throw new Error(`${key} must be a JSON list of text values.`); }
    if (!Array.isArray(parsed) || parsed.some(item => typeof item !== "string")) {
      throw new Error(`${key} must be a JSON list of text values.`);
    }
    return parsed;
  };
  const status = optional("status") ?? "want_to_read";
  const statuses: Record<string, string> = {
    "want to read": "want_to_read", "want_to_read": "want_to_read", "reading": "reading", "read": "read",
  };
  const authors = list("authors");
  if (optional("coverUrl") && !/^https?:\/\//i.test(optional("coverUrl")!)) {
    throw new Error("Cover image URL must start with https:// or http://.");
  }
  // Existing exports can contain legacy text longer than the manual editor's
  // limit. Restore it intact, with a bounded import-specific size, not truncation.
  for (const field of ["notes", "description"]) {
    if ((values[field]?.length ?? 0) > 1_000_000) throw new Error(`${field} exceeds the import limit of 1,000,000 characters.`);
  }
  const parsed = CreateBookBody.omit({ notes: true, description: true }).safeParse({
    title: values.title ?? "", author: authors?.join(", ") || values.author || "",
    authors, status: statuses[status.toLowerCase()] ?? status,
    genre: optional("genre"), pages: number("pages"), rating: number("rating"),
    publishedYear: number("publishedYear"), isOwned: parseBoolean(values.isOwned, "Owned"),
    isbn: optional("isbn"), description: optional("description"), coverUrl: optional("coverUrl"),
    openLibraryId: optional("openLibraryId"), notes: values.notes || null,
    startedOn: optional("startedOn"), finishedOn: optional("finishedOn"), moodTags: list("moodTags"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  }
  const timestamps: PreparedImport["timestamps"] = {};
  for (const field of ["createdAt", "updatedAt"] as const) {
    const value = optional(field);
    if (value) {
      if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) {
        throw new Error(`${field} must be an ISO timestamp.`);
      }
      timestamps[field] = new Date(value);
    }
  }
  return { input: normalizeBookInput({ ...parsed.data, notes: values.notes || null, description: optional("description") }),
    starred: parseBoolean(values.starred, "Starred"), timestamps };
}

const textKey = (value: string) => value.trim().normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
function matches(a: LibraryInput, b: Pick<LibraryInput, "isbn" | "openLibraryId" | "title" | "authors">) {
  if (a.isbn && b.isbn) return a.isbn.replace(/[-\s]/g, "").toUpperCase() === b.isbn.replace(/[-\s]/g, "").toUpperCase();
  if (a.openLibraryId && b.openLibraryId) return textKey(a.openLibraryId) === textKey(b.openLibraryId);
  return textKey(a.title) === textKey(b.title)
    && JSON.stringify(a.authors.map(textKey).sort()) === JSON.stringify(b.authors.map(textKey).sort());
}

/** Pure preview. Source IDs are never treated as local or catalog IDs. */
export function previewImport(rows: LibraryImportRow[], books: LibraryBook[], owner: string) {
  const prepared: PreparedImport[] = [];
  const results = rows.map(row => {
    try {
      const entry = prepareImportRow(row.values);
      const existing = books.find(book => matches(entry.input, book));
      const earlier = prepared.find(book => matches(entry.input, book.input));
      if (existing || earlier) {
        return { row: row.row, title: entry.input.title, disposition: "duplicate" as const,
          problems: [existing ? "Already in your library; kept unchanged." : "Repeated earlier in this file; skipped."] };
      }
      prepared.push(entry);
      return { row: row.row, title: entry.input.title, disposition: "ready" as const, problems: [] };
    } catch (error) {
      return { row: row.row, title: row.values.title || "(Untitled)", disposition: "invalid" as const,
        problems: [(error as Error).message] };
    }
  });
  // Binds confirmation to both this payload and this user's current library.
  const previewToken = createHash("sha256").update(JSON.stringify({
    owner, rows, library: books.map(book => [book.id, book.updatedAt.toISOString()]).sort((a, b) => Number(a[0]) - Number(b[0])),
  })).digest("hex");
  return { prepared, preview: {
    rows: results, previewToken, ready: prepared.length,
    invalid: results.filter(row => row.disposition === "invalid").length,
    duplicates: results.filter(row => row.disposition === "duplicate").length,
  } };
}
