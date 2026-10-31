import assert from "node:assert/strict";
import test from "node:test";
import { PickNextBookQueryParams } from "@workspace/api-zod";
import { pickNextLibraryBook } from "./book-picker";
import type { LibraryBook } from "./library";

const books: (Pick<LibraryBook, "id" | "status" | "genre" | "pages" | "moodTags">)[] = [
  { id: 1, status: "want_to_read", genre: "Rom-com", pages: 200, moodTags: ["light", "Funny"] },
  { id: 2, status: "want_to_read", genre: "History", pages: 250, moodTags: ["absorbing"] },
  { id: 3, status: "want_to_read", genre: "Fantasy", pages: 600, moodTags: ["absorbing"] },
  { id: 4, status: "read", genre: "History", pages: 200, moodTags: ["absorbing"] },
  { id: 5, status: "reading", genre: "History", pages: 200, moodTags: ["absorbing"] },
  { id: 6, status: "want_to_read", genre: null, pages: null, moodTags: [] },
];

test("only want-to-read books qualify; both ends of the random range work", () => {
  assert.equal(pickNextLibraryBook(books, {}, () => 0)?.id, 1);
  assert.equal(pickNextLibraryBook(books, {}, () => 0.999999)?.id, 6);
  assert.equal(pickNextLibraryBook(books.filter(b => b.status !== "want_to_read"), {}), null);
  assert.equal(pickNextLibraryBook([], {}), null);
});

test("genre, mood, and maximum length combine without relaxing constraints", () => {
  const filters = { genre: "history", moodTag: " absorbing ", maxPages: 250 };
  assert.equal(pickNextLibraryBook(books, filters)?.id, 2);
  assert.equal(pickNextLibraryBook(books, { ...filters, maxPages: 249 }), null);
  assert.equal(pickNextLibraryBook(books, { genre: "History", moodTag: "light" }), null);
  assert.equal(pickNextLibraryBook(books, { moodTag: "funny" })?.id, 1);
});

test("excluding a genre broadens choices without claiming missing genres qualify", () => {
  const options = { excludeGenre: "  ROM-COM ", maxPages: 300 };
  assert.equal(pickNextLibraryBook(books, options, () => 0)?.id, 2);
  assert.equal(pickNextLibraryBook(books, { excludeGenre: "Rom-com" }, () => 0.999999)?.id, 3);
  assert.equal(pickNextLibraryBook(books, { genre: "Rom-com", excludeGenre: "Rom-com" }), null);
});

test("missing page counts qualify only when no length limit is set", () => {
  const unknown = books.filter(b => b.id === 6);
  assert.equal(pickNextLibraryBook(unknown, {})?.id, 6);
  assert.equal(pickNextLibraryBook(unknown, { maxPages: 1000 }), null);
});

test("drawing is read-only and cannot change status or library order", () => {
  const before = structuredClone(books);
  pickNextLibraryBook(books, { excludeGenre: "Rom-com" });
  assert.deepEqual(books, before);
});

test("request validation accepts only positive integer page limits", () => {
  for (const maxPages of ["0", "-1", "1.5", "abc"]) {
    assert.equal(PickNextBookQueryParams.safeParse({ maxPages }).success, false);
  }
  assert.equal(PickNextBookQueryParams.parse({ maxPages: "250" }).maxPages, 250);
});
