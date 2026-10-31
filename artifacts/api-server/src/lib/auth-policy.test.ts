import test from "node:test";
import assert from "node:assert/strict";
import { safeFrontend, opaqueCode, loginChallenge, validChallenge, sessionHash } from "./auth-policy";

test("return URLs must match the complete configured frontend base", () => {
  const allowed = ["https://reader.github.io/book-tracker/"];
  assert.equal(safeFrontend(allowed[0], allowed), allowed[0]);
  for (const target of ["https://evil.test/", "//evil.test/", "/books", "javascript:alert(1)",
    "https://reader.github.io/another-repo/", "https://reader.github.io/book-tracker/?to=evil",
    "https://reader.github.io/book-tracker/#bad", "https://reader.github.io.evil.test/book-tracker/"]) {
    assert.equal(safeFrontend(target, allowed), null);
  }
});
test("login proof and session tokens use strong unpredictable values and distinct hashes", () => {
  const token = opaqueCode(), other = opaqueCode();
  assert.equal(token.length, 43);
  assert.equal(validChallenge(loginChallenge(token)), true);
  assert.notEqual(token, other);
  assert.notEqual(loginChallenge(token), loginChallenge(other));
  assert.equal(sessionHash(token).length, 64);
  assert.notEqual(sessionHash(token), token);
  for (const bad of ["", "a".repeat(42), "a".repeat(44), "a".repeat(42) + "+", null]) {
    assert.equal(validChallenge(bad), false);
  }
});
