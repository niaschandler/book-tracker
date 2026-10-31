import assert from "node:assert/strict";
import test from "node:test";
import { requiredBookErrors } from "./book-form-validation";

test("empty and whitespace-only required fields show friendly messages", () => {
  for (const blank of ["", "   ", "\t\n", "\u00a0"]) {
    const errors = requiredBookErrors(blank, blank);
    assert.equal(errors.title, "Please enter the book’s title.");
    assert.equal(errors.author, "Please enter at least one author’s name.");
  }
});

test("each missing field is identified independently", () => {
  assert.equal(requiredBookErrors("", "Octavia Butler").author, undefined);
  assert.equal(requiredBookErrors("Kindred", "").title, undefined);
  assert.ok(requiredBookErrors("Kindred", "").author);
  assert.ok(requiredBookErrors("", "Octavia Butler").title);
});

test("author separators alone do not count as an author", () => {
  assert.ok(requiredBookErrors("Kindred", " ; ; ").author);
});

test("correcting required fields clears their errors", () => {
  for (const author of [" Octavia Butler ", "Author One; Author Two", "; Author One; "]) {
    assert.deepEqual(requiredBookErrors(" A book title ", author), {
      title: undefined,
      author: undefined,
    });
  }
});
