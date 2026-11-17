import assert from "node:assert/strict";
import { test } from "node:test";
import { allocate } from "../src/lib/pricing";

test("allocate splits an amount without losing cents", () => {
  const parts = allocate(100, [33, 33, 34]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 100);
});

test("allocate gives the rounding remainder to the last item", () => {
  assert.deepEqual(allocate(10, [1, 1, 1]), [3, 3, 4]);
});

test("allocate tolerates zero totals and empty baskets", () => {
  assert.deepEqual(allocate(0, [5, 5]), [0, 0]);
  assert.deepEqual(allocate(100, []), []);
  assert.deepEqual(allocate(100, [0, 0]), [0, 0]);
});
