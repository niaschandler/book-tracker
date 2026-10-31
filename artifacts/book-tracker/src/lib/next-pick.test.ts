import assert from "node:assert/strict";
import test from "node:test";
import { pickOptions, validatePickFilters } from "./next-pick";

const base = { genre: "", excludeGenre: "", moodTag: "", maxPages: "" };
test("empty filters are valid with no params", () => assert.deepEqual(validatePickFilters(base), { ok: true, params: {} }));
test("valid page limit coerces", () => assert.deepEqual(validatePickFilters({ ...base, maxPages: " 320 " }), { ok: true, params: { maxPages: 320 } }));
test("rejects bad page limits", () => { for (const v of ["0", "-3", "2.5", "abc", "1e3"]) assert.equal(validatePickFilters({ ...base, maxPages: v }).ok, false); });
test("rejects same include/exclude genre case-insensitively", () => { const r = validatePickFilters({ ...base, genre: "Romance", excludeGenre: "romance" }); assert.equal(r.ok, false); if (!r.ok) assert.equal(r.field, "excludeGenre"); });
test("keeps all params", () => assert.deepEqual(validatePickFilters({ genre: "Mystery", excludeGenre: "Romance", moodTag: "cozy", maxPages: "200" }), { ok: true, params: { genre: "Mystery", excludeGenre: "Romance", moodTag: "cozy", maxPages: 200 } }));
test("options only from want_to_read", () => {
  const o = pickOptions([{ status: "want_to_read", genre: "Romance", moodTags: ["cozy"] }, { status: "read", genre: "Horror", moodTags: ["dark"] }, { status: "want_to_read", genre: null, moodTags: [] }, { status: "want_to_read", genre: "romance", moodTags: ["Cozy"] }]);
  assert.deepEqual(o, { count: 3, genres: ["Romance"], moods: ["cozy"], noGenre: 1 });
});
