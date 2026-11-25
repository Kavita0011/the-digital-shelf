import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIlikeFilter, sanitizeSearchTerm } from "../src/lib/search";

test("sanitizeSearchTerm strips PostgREST filter metacharacters", () => {
  const safe = sanitizeSearchTerm("100%, (planner), v2\\beta");
  assert.ok(!/[%,()\\]/.test(safe));
  assert.equal(safe.replace(/\s+/g, " ").trim(), "100 planner v2 beta");
});

test("sanitizeSearchTerm strips control characters and null bytes", () => {
  const safe = sanitizeSearchTerm("bad\0name\nor(id.gt.0)\tend");
  assert.ok(!/[\u0000-\u001F\u007F]/.test(safe));
  assert.ok(!safe.includes("("));
  assert.equal(safe, "bad name or id.gt.0 end");
});

test("sanitizeSearchTerm trims and truncates to a bounded length", () => {
  assert.equal(sanitizeSearchTerm("  hello  "), "hello");
  assert.equal(sanitizeSearchTerm("x".repeat(200)).length, 120);
});

test("buildIlikeFilter cannot inject an additional filter condition", () => {
  const injected = "widget,or(id.gt.0)";
  const filter = buildIlikeFilter(injected, "title", "short_description");
  // A single comma separator plus two ilike clauses, and no group syntax.
  assert.equal(filter, "title.ilike.%widget or id.gt.0%,short_description.ilike.%widget or id.gt.0%");
  assert.ok(!filter.includes(",or("));
  assert.ok(!filter.includes("("));
});

test("buildIlikeFilter rejects columns that are not plain identifiers", () => {
  assert.throws(
    () => buildIlikeFilter("book", "title);drop", "short_description"),
    /Invalid PostgREST filter column/,
  );
  assert.throws(
    () => buildIlikeFilter("book", "title", "short.description.eq.1,or(id.gt.0)"),
    /Invalid PostgREST filter column/,
  );
});

test("buildIlikeFilter respects a custom max length from the caller", () => {
  const filter = buildIlikeFilter("x".repeat(200), "title", "short_description", 80);
  assert.ok(filter.length <= 80 * 2 + "title.ilike.%%,short_description.ilike.%%".length);
});
