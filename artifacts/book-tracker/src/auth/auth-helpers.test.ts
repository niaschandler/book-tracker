import assert from "node:assert/strict";
import test from "node:test";
import { base64Url, createVerifier, frontendRoot, loginUrl, parseApiOrigin, readCallback, friendlyLoginError } from "./auth-helpers";

test("verifier is 43 base64url chars", () => {
  const v = createVerifier(a => a.fill(255));
  assert.equal(v.length, 43);
  assert.match(v, /^[A-Za-z0-9_-]+$/);
  assert.equal(base64Url(new Uint8Array([251, 255])), "-_8");
});
test("api origin validation", () => {
  assert.equal(parseApiOrigin(""), "");
  assert.equal(parseApiOrigin(undefined), "");
  assert.equal(parseApiOrigin("https://api.example.com"), "https://api.example.com");
  assert.equal(parseApiOrigin("https://api.example.com/"), "https://api.example.com");
  assert.equal(parseApiOrigin("http://localhost:8080"), "http://localhost:8080");
  assert.throws(() => parseApiOrigin("http://api.example.com"));
  assert.throws(() => parseApiOrigin("https://api.example.com/api"));
  assert.throws(() => parseApiOrigin("https://api.example.com?x=1"));
  assert.throws(() => parseApiOrigin("https://api.example.com#x"));
  assert.throws(() => parseApiOrigin("api.example.com"));
});
test("frontend root and login url", () => {
  assert.equal(frontendRoot("https://me.github.io", "/marginalia/"), "https://me.github.io/marginalia/");
  assert.equal(frontendRoot("https://x.dev", "/"), "https://x.dev/");
  const u = new URL(loginUrl("https://api.dev", "https://x.dev/", "abc"));
  assert.equal(u.pathname, "/api/login");
  assert.equal(u.searchParams.get("returnTo"), "https://x.dev/");
  assert.equal(u.searchParams.get("challenge"), "abc");
});
test("callback parsing strips params and keeps hash", () => {
  const r = readCallback("https://x.dev/app/?login_code=c1&keep=1#/books");
  assert.equal(r.code, "c1");
  assert.equal(r.error, null);
  assert.equal(r.cleaned, "/app/?keep=1#/books");
  assert.equal(readCallback("https://x.dev/?login_error=access_denied").cleaned, "/");
  assert.ok(friendlyLoginError("<script>").includes("Replit"));
});
