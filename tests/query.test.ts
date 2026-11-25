import assert from "node:assert/strict";
import { test } from "node:test";
import { enumParam, parseSlugParam, parseTokenParam, parseUuidParam, patternParam } from "../src/lib/query";

const UUID = "81871e7b-f90b-4eed-8261-f8f809915798";

test("parseUuidParam accepts only valid UUIDs", () => {
  assert.equal(parseUuidParam(UUID), UUID);
  assert.throws(() => parseUuidParam(`${UUID}' or 1=1 --`), { status: 400 });
  assert.throws(() => parseUuidParam("not-a-uuid"), { status: 400 });
});

test("parseSlugParam accepts only lowercase hyphenated slugs", () => {
  assert.equal(parseSlugParam("my-product-2"), "my-product-2");
  assert.throws(() => parseSlugParam("product'--"), { status: 400 });
  assert.throws(() => parseSlugParam("UPPER"), { status: 400 });
});

test("parseTokenParam accepts generated hex download tokens", () => {
  const token = "a".repeat(64);
  assert.equal(parseTokenParam(token), token);
  assert.throws(() => parseTokenParam("short"), { status: 400 });
  assert.throws(() => parseTokenParam(`${token},or(id.gt.0)`), { status: 400 });
});

test("enumParam rejects values outside the allowlist", () => {
  assert.equal(enumParam("paid", ["pending", "paid"] as const, "status"), "paid");
  assert.equal(enumParam(null, ["pending", "paid"] as const, "status"), null);
  assert.throws(() => enumParam("paid,or(id.gt.0)", ["pending", "paid"] as const, "status"), { status: 400 });
});

test("patternParam bounds free-text audit filters", () => {
  assert.equal(patternParam("auth.login", "action"), "auth.login");
  assert.equal(patternParam("", "action"), null);
  assert.throws(() => patternParam("a".repeat(200), "action"), { status: 400 });
  assert.throws(() => patternParam("auth.login,or(id.gt.0)", "action"), { status: 400 });
});
