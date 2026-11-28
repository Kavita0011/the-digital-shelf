import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("seller delete is role- and owner-scoped and soft-deletes", () => {
  const source = read("src/app/api/seller/products/[id]/route.ts");

  assert.match(source, /export const DELETE = route/);
  assert.match(source, /user\.role !== "seller"/);
  assert.match(source, /assertOwnership\(user\.id, id\)/);
  assert.match(source, /status: "removed"/);
  assert.match(source, /action: "product\.deleted"/);
  assert.match(source, /softDelete: true/);
  // Hard deletes would break order, payment and invoice history.
  assert.doesNotMatch(source, /\.delete\(\)/);
});

test("sellers can edit every product except one actively scanning", async () => {
  const { canSellerEdit } = await import("../src/lib/product-workflow");

  for (const status of ["draft", "rejected", "pending_review", "approved", "hidden", "removed"]) {
    assert.equal(canSellerEdit(status), true, `${status} should be editable`);
  }
  for (const status of ["uploading", "scanning"]) {
    assert.equal(canSellerEdit(status), false, `${status} should not be editable`);
  }
});

test("seller dashboard exposes edit and delete controls", () => {
  const page = read("src/app/seller/products/page.tsx");
  const actions = read("src/components/seller-product-actions.tsx");
  const editPage = read("src/app/seller/products/[id]/edit/page.tsx");

  assert.match(page, /<SellerProductActions/);
  assert.match(actions, /window\.confirm/);
  assert.match(actions, /method: "DELETE"/);
  assert.match(actions, /canSellerEdit\(status\)/);
  assert.match(editPage, /canSellerEdit\(product\.status\)/);
});
