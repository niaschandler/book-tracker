import test from "node:test";
import assert from "node:assert/strict";
import { findLibraryBooks } from "./book-search";

const books = [
  { id: 1, catalogBookId: 11, title: "Kindred", authors: ["Octavia Butler"], genre: "Fiction", status: "read" as const, isOwned: true, rating: 5, pages: 300, createdAt: new Date("2026-01-01") },
  { id: 2, catalogBookId: 12, title: "A History", authors: ["Writer One", "Writer Two"], genre: "History", status: "want_to_read" as const, isOwned: false, rating: null, pages: null, createdAt: new Date("2026-03-01") },
  { id: 3, catalogBookId: 13, title: "Parable", authors: ["Octavia Butler"], genre: "Fiction", status: "reading" as const, isOwned: true, rating: 4, pages: 400, createdAt: new Date("2026-02-01") },
];
const stars = new Set([11, 12]);
const ids = (rows: { id: number }[]) => rows.map(b => b.id);

test("search ignores case and extra whitespace, across title and all authors", () => {
  assert.deepEqual(ids(findLibraryBooks(books, { search: "  BUTLER   kind " }, stars)), [1]);
  assert.deepEqual(ids(findLibraryBooks(books, { search: "writer TWO" }, stars)), [2]);
  assert.deepEqual(ids(findLibraryBooks(books, { search: "   " }, stars)), [2, 3, 1]);
});

test("filters combine with search and use catalog IDs for stars", () => {
  assert.deepEqual(ids(findLibraryBooks(books, { search: "butler", genre: "Fiction", status: "read", isOwned: true, starredOnly: true }, stars)), [1]);
  assert.deepEqual(ids(findLibraryBooks(books, { isOwned: false }, stars)), [2]);
  assert.deepEqual(ids(findLibraryBooks(books, { starredOnly: true }, new Set())), []);
  assert.deepEqual(ids(findLibraryBooks(books, { genre: "History", status: "read" }, stars)), []);
});

test("newest, title, rating, and page sorts put missing values last", () => {
  assert.deepEqual(ids(findLibraryBooks(books, { sort: "newest" }, stars)), [2, 3, 1]);
  assert.deepEqual(ids(findLibraryBooks(books, { sort: "title" }, stars)), [2, 1, 3]);
  assert.deepEqual(ids(findLibraryBooks(books, { sort: "rating" }, stars)), [1, 3, 2]);
  assert.deepEqual(ids(findLibraryBooks(books, { sort: "pages" }, stars)), [3, 1, 2]);
});

test("sort ties are stable and filtering never mutates the input", () => {
  const tied = books.map(b => ({ ...b, rating: 5 })).reverse();
  assert.deepEqual(ids(findLibraryBooks(tied, { sort: "rating" }, stars)), [1, 2, 3]);
  assert.deepEqual(ids(tied), [3, 2, 1]);
  assert.deepEqual(ids(books), [1, 2, 3]);
});
