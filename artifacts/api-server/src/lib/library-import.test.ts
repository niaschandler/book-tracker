import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareImportRow, previewImport } from "./library-import";
import type { LibraryImportRow } from "@workspace/api-zod";
import type { LibraryBook } from "./library";

const values = {
  title: "  A book ", author: "Writer, Jr.", authors: '["Writer, Jr."," Other "]',
  status: "Read", isOwned: "Yes", starred: "TRUE", pages: "250", rating: "5",
  moodTags: '[" calm ","calm",""]', startedOn: "2026-01-01", finishedOn: "2026-01-03",
  isbn: "0000123456789", notes: " Private note \n",
};
test("normalizes with the existing book rules, preserving private text and structured lists", () => {
  const prepared = prepareImportRow(values);
  assert.equal(prepared.input.title, "A book");
  assert.deepEqual(prepared.input.authors, ["Writer, Jr.", "Other"]);
  assert.deepEqual(prepared.input.moodTags, ["calm"]);
  assert.equal(prepared.input.status, "read");
  assert.equal(prepared.input.isOwned, true);
  assert.equal(prepared.starred, true);
  assert.equal(prepared.input.notes, values.notes);
  assert.equal(prepared.input.isbn, values.isbn);
  assert.equal(prepareImportRow({ title: "Title", author: "Author" }).input.status, "want_to_read");
  assert.equal(prepareImportRow({ ...values, notes: "文".repeat(70000) }).input.notes?.length, 70000);
});
test("invalid data is explained without a write or silent coercion", () => {
  const invalid: Record<string, string>[] = [
    { title: " " }, { authors: "not json" }, { authors: "[1]" }, { pages: "1.5" },
    { pages: "0" }, { rating: "6" }, { publishedYear: "3001" }, { status: "finished" },
    { isOwned: "maybe" }, { starred: "maybe" }, { startedOn: "2026-02-30" },
    { finishedOn: "2025-01-01" }, { createdAt: "yesterday" }, { coverUrl: "javascript:alert(1)" }, { pages: "2147483648" },
  ];
  for (const change of invalid) assert.throws(() => prepareImportRow({ ...values, ...change }), JSON.stringify(change));
});
test("previews duplicates against this library and earlier valid file rows, never source IDs", () => {
  const current = {
    ...prepareImportRow(values).input, id: 7, catalogBookId: 99,
    createdAt: new Date("2026-01-01Z"), updatedAt: new Date("2026-01-01Z"),
  } as LibraryBook;
  const rows: LibraryImportRow[] = [
    { row: 2, values: { ...values, isbn: "0000-123456789" } },
    { row: 3, values: { title: "Another", author: "A", id: "7" } },
    { row: 4, values: { title: " another ", author: "a" } },
    { row: 5, values: { title: "", author: "A" } },
    { row: 6, values: { ...values, isbn: "9781234567890" } },
  ];
  const { preview, prepared } = previewImport(rows, [current], "owner-a");
  assert.equal(preview.ready, 2);
  assert.equal(preview.duplicates, 2);
  assert.equal(preview.invalid, 1);
  assert.equal(prepared.length, 2);
  assert.notEqual(preview.previewToken, previewImport(rows, [current], "owner-b").preview.previewToken);
  assert.notEqual(preview.previewToken, previewImport(rows, [], "owner-a").preview.previewToken);
  assert.equal(preview.previewToken, previewImport(rows, [current], "owner-a").preview.previewToken);
});
