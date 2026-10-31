import assert from "node:assert/strict";
import test from "node:test";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";
import { computeDashboardSummary } from "./dashboard-summary";
import type { LibraryBook } from "./library";

const now = new Date("2026-10-31T12:00:00Z");
function book(id: number, values: Partial<LibraryBook> = {}): LibraryBook {
  return {
    id, catalogBookId: id + 100, title: `Book ${id}`, authors: ["Writer"],
    genre: "Fiction", pages: 200, publishedYear: null, isbn: null,
    description: null, coverUrl: null, openLibraryId: null, status: "read",
    isOwned: false, rating: null, startedOn: null, finishedOn: null,
    notes: null, moodTags: [], createdAt: now, updatedAt: now, ...values,
  };
}

test("empty libraries show zero counts and no invented ratings or records", () => {
  const summary = computeDashboardSummary([], new Set(), now);
  assert.equal(summary.totalBooks, 0);
  assert.equal(summary.totalPagesRead, 0);
  assert.equal(summary.averageRating, null);
  assert.equal(summary.longestReadBook, null);
  assert.equal(summary.fastestReadBook, null);
  assert.equal(summary.fastestReadingDays, null);
  assert.deepEqual(summary.genreBreakdown, []);
  assert.doesNotThrow(() => GetDashboardSummaryResponse.parse(summary));
});

test("stats use finished books; ownership and total counts include all records", () => {
  const summary = computeDashboardSummary([
    book(1, { pages: 300, rating: 5, isOwned: true, startedOn: "2026-10-01", finishedOn: "2026-10-05" }),
    book(2, { pages: 500, rating: 3, genre: "History", startedOn: "2026-09-01", finishedOn: "2026-09-03" }),
    book(3, { pages: null, genre: null }),
    book(4, { status: "reading", rating: 1, pages: 1000, isOwned: true }),
    book(5, { status: "want_to_read", pages: 2000 }),
  ], new Set([102]), now);
  assert.equal(summary.totalBooks, 5);
  assert.equal(summary.readCount, 3);
  assert.equal(summary.ownedCount, 2);
  assert.equal(summary.wantToReadCount, 1);
  assert.equal(summary.totalPagesRead, 800);
  assert.equal(summary.averageRating, 4);
  assert.equal(summary.longestReadBook?.id, 2);
  assert.equal(summary.longestReadBook?.starred, true);
  assert.equal(summary.fastestReadBook?.id, 2);
  assert.equal(summary.fastestReadingDays, 2);
  assert.equal(summary.monthlyReadCount, 1);
  assert.equal(summary.genreBreakdown.reduce((sum, genre) => sum + genre.count, 0), 3);
  assert.ok(summary.genreBreakdown.some(genre => genre.genre === "Uncategorized"));
  assert.doesNotThrow(() => GetDashboardSummaryResponse.parse(summary));
});

test("same-day completion is zero elapsed days, not missing data", () => {
  const summary = computeDashboardSummary([
    book(1, { startedOn: "2026-10-31", finishedOn: "2026-10-31" }),
    book(2, { startedOn: "2026-10-01", finishedOn: "2026-10-02" }),
  ], new Set(), now);
  assert.equal(summary.fastestReadingDays, 0);
  assert.equal(summary.fastestReadBook?.id, 1);
});

test("missing, invalid, or reversed dates cannot win fastest read", () => {
  const summary = computeDashboardSummary([
    book(1, { startedOn: "2026-10-03", finishedOn: "2026-10-01" }),
    book(2, { startedOn: "2026-02-30", finishedOn: "2026-03-03" }),
    book(3, { finishedOn: "2026-10-01" }),
    book(4, { pages: null }),
  ], new Set(), now);
  assert.equal(summary.fastestReadBook, null);
  assert.equal(summary.fastestReadingDays, null);
  assert.equal(summary.monthlyReadCount, 2);
});

test("all genre categories are retained and ties are deterministic", () => {
  const rows = Array.from({ length: 10 }, (_, i) =>
    book(i + 1, { genre: `Genre ${i}`, startedOn: "2026-10-01", finishedOn: "2026-10-02" }),
  );
  const summary = computeDashboardSummary(rows.reverse(), new Set(), now);
  assert.equal(summary.genreBreakdown.length, 10);
  assert.equal(summary.longestReadBook?.id, 1);
  assert.equal(summary.fastestReadBook?.id, 1);
  assert.equal(rows[0].id, 10, "summary must not mutate library order");
});

test("month counting is based on saved finish dates and the current UTC month", () => {
  const summary = computeDashboardSummary([
    book(1, { finishedOn: "2026-09-30" }),
    book(2, { finishedOn: "2026-10-01" }),
    book(3, { finishedOn: "2026-11-01" }),
    book(4, { status: "reading", finishedOn: "2026-10-20" }),
  ], new Set(), now);
  assert.equal(summary.monthlyReadCount, 1);
});
