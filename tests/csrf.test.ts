import assert from "node:assert/strict";
import { test } from "node:test";
import { newCsrfToken, verifyCsrfCookie } from "../src/lib/csrf";

process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123456789abcdef";

test("a freshly issued CSRF cookie verifies to its raw token", () => {
  const { token, cookie } = newCsrfToken();
  assert.equal(verifyCsrfCookie(cookie), token);
});

test("a tampered or missing CSRF cookie is rejected", () => {
  const { cookie } = newCsrfToken();
  const [token, mac] = cookie.split(".");
  assert.equal(verifyCsrfCookie(`${token}.${mac.slice(0, -1)}x`), null);
  assert.equal(verifyCsrfCookie(undefined), null);
});
