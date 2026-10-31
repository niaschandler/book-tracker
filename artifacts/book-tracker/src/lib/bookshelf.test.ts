import assert from "node:assert/strict";
import test from "node:test";
import { bookshelfGroups, finishedBooks, groupShelves, shelfStats, spineMetrics } from "./bookshelf";

const mk = (id: number, status: string, extra: Record<string, unknown> = {}) => ({ id, title: `Book ${id}`, status, createdAt: "2024-01-01T00:00:00Z", isOwned: id % 2 === 0, ...extra });

const mixed = [
  mk(1, "read", { pages: 300, finishedOn: "2024-05-01", isOwned: true }),
  mk(2, "want_to_read", { pages: 900, finishedOn: "2024-06-01", isOwned: true }),
  mk(3, "reading", { pages: 120, isOwned: false }),
  mk(4, "read", { pages: null, finishedOn: "2023-02-10", isOwned: false }),
  mk(5, "read", { pages: 150, finishedOn: null, isOwned: true }),
  mk(6, "read", { pages: 200, finishedOn: "2024-09-01", isOwned: false }),
];

test("only read books are kept, regardless of ownership", () => {
  const ids = finishedBooks(mixed).map((b) => b.id).sort();
  assert.deepEqual(ids, [1, 4, 5, 6]);
  assert.deepEqual(finishedBooks(undefined), []);
});

test("groups by finish year newest first, undated last, unfinished excluded", () => {
  const g = groupShelves(mixed);
  assert.deepEqual(g.map((s) => s.key), ["2024", "2023", "undated"]);
  assert.deepEqual(g[0].books.map((b) => b.id), [6, 1]);
  assert.ok(g.every((s) => s.books.every((b) => b.status === "read")));
  assert.deepEqual(groupShelves([mk(9, "reading")]), []);
});

test("counts and pages only finished books; unknown pages reported honestly", () => {
  assert.deepEqual(shelfStats(mixed), { count: 4, pagesKnown: 650, booksWithPages: 3, booksWithoutPages: 1 });
  assert.deepEqual(shelfStats([]), { count: 0, pagesKnown: 0, booksWithPages: 0, booksWithoutPages: 0 });
});

test("spine metrics are deterministic and bounded", () => {
  const a = spineMetrics({ id: 1, title: "X", pages: 5000 });
  assert.deepEqual(a, spineMetrics({ id: 1, title: "X", pages: 5000 }));
  assert.equal(a.width, 64);
  assert.equal(spineMetrics({ id: 1, title: "X", pages: null }).width, 40);
});

test("invalid finish dates stay in the undated shelf without losing books", () => {
  const input = [
    mk(1, "read", { finishedOn: "2026-02-30" }),
    mk(2, "read", { finishedOn: "bad date" }),
    mk(3, "read", { finishedOn: "2026-03-01" }),
  ];
  const groups = groupShelves(input);
  assert.deepEqual(groups.map(g => g.key), ["2026", "undated"]);
  assert.equal(groups.reduce((n, g) => n + g.books.length, 0), 3);
  assert.deepEqual(input.map(b => b.id), [1, 2, 3]);
});

test("bought shelf includes owned unfinished books, including currently reading", () => {
  const rows = [...mixed, mk(7, "reading", { isOwned: true }), mk(8, "want_to_read", { isOwned: false })];
  const groups = bookshelfGroups(rows);
  const bought = groups.find(g => g.key === "bought-unread")!;
  assert.deepEqual(bought.books.map(b => b.id), [2, 7]);
  const ids = groups.flatMap(g => g.books.map(b => b.id));
  assert.equal(new Set(ids).size, ids.length, "Books cannot appear on both shelves");
  assert.deepEqual(shelfStats(rows), shelfStats(mixed), "Unread books must not inflate finished stats");
});

test("marking an owned book read moves it from bought to finished", () => {
  const waiting = mk(9, "want_to_read", { isOwned: true });
  assert.equal(bookshelfGroups([waiting]).find(g => g.key === "bought-unread")?.books.length, 1);
  const groups = bookshelfGroups([{ ...waiting, status: "read" }]);
  assert.equal(groups.find(g => g.key === "bought-unread")?.books.length, 0);
  assert.deepEqual(groups.find(g => g.key === "undated")?.books.map(b => b.id), [9]);
});

test("bought shelf remains visible when empty", () => {
  assert.deepEqual(bookshelfGroups([]), [{ key: "bought-unread", label: "Bought, not yet read", books: [] }]);
});
