import assert from "node:assert/strict";
import { test } from "node:test";
import { deviceLabel, MAX_SESSIONS, sessionIdFromAccessToken } from "../src/lib/sessions";

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256" })}.${encode(payload)}.signature`;
}

test("session id is read only from a well-formed Supabase access token", () => {
  const id = "9f8c3b0e-4b7d-4f1a-9f2e-1b6c5d4a3f20";
  assert.equal(sessionIdFromAccessToken(fakeJwt({ session_id: id, sub: "user" })), id);
  assert.equal(sessionIdFromAccessToken(fakeJwt({ sub: "user" })), null);
  assert.equal(sessionIdFromAccessToken("not-a-jwt"), null);
});

test("user agents become readable device labels", () => {
  assert.match(deviceLabel("Mozilla/5.0 (Windows NT 10.0) Chrome/120.0"), /Chrome on Windows/);
  assert.match(deviceLabel("Mozilla/5.0 (iPhone) Safari/605"), /Safari on iOS/);
  assert.equal(deviceLabel(null), "Unknown device");
});

test("the account session cap is three devices", () => {
  assert.equal(MAX_SESSIONS, 3);
});
