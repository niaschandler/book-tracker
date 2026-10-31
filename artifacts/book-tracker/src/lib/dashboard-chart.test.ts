import assert from "node:assert/strict";
import test from "node:test";
import { formatDays, monthlyCompletions, namedGenreCount } from "./dashboard-chart";

test("buckets finished books into trailing 12 UTC months", () => {
  const now = new Date(Date.UTC(2025, 2, 15));
  const { buckets, undated } = monthlyCompletions([
    { status: "read", finishedOn: "2025-03-01T00:00:00Z" },
    { status: "read", finishedOn: "2024-04-30" },
    { status: "read", finishedOn: "2024-03-31" },
    { status: "reading", finishedOn: "2025-03-02" },
    { status: "read", finishedOn: null },
  ], now);
  assert.equal(buckets.length, 12);
  assert.equal(buckets[0].key, "2024-04");
  assert.equal(buckets[11].key, "2025-03");
  assert.equal(buckets[11].count, 1);
  assert.equal(buckets[0].count, 1);
  assert.equal(undated, 1);
});

test("genre and day helpers", () => {
  assert.equal(namedGenreCount([{ genre: "Uncategorized", count: 2 }, { genre: "Unknown", count: 1 }, { genre: "Poetry", count: 1 }]), 1);
  assert.equal(formatDays(0), "Same day");
  assert.equal(formatDays(1), "1 day");
  assert.equal(formatDays(null), null);
});

test("missing and impossible finish dates are excluded, and empty months stay zero", () => {
  const { buckets, undated } = monthlyCompletions([
    { status: "read", finishedOn: "2026-02-30" },
    { status: "read", finishedOn: "not a date" },
    { status: "read", finishedOn: "" },
  ], new Date("2026-10-31T00:00:00Z"));
  assert.equal(undated, 3);
  assert.ok(buckets.every(bucket => bucket.count === 0));
});

test("month boundaries include the current month across a year rollover", () => {
  const { buckets } = monthlyCompletions([
    { status: "read", finishedOn: "2025-12-31" },
    { status: "read", finishedOn: "2026-01-01" },
    { status: "want_to_read", finishedOn: "2026-01-01" },
  ], new Date("2026-01-10T00:00:00Z"));
  assert.equal(buckets[10].key, "2025-12");
  assert.equal(buckets[10].count, 1);
  assert.equal(buckets[11].key, "2026-01");
  assert.equal(buckets[11].count, 1);
});
