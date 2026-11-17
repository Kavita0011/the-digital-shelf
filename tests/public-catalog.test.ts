import assert from "node:assert/strict";
import { test } from "node:test";
import { PUBLIC_CATEGORY_COLUMNS, PUBLIC_PRODUCT_COLUMNS } from "../src/lib/public-catalog";

const SENSITIVE_PRODUCT_COLUMNS = [
  "rejection_reason",
  "file_id",
  "file_checksum",
  "approved_by",
  "updated_at",
];

test("public product projection excludes internal-only columns", () => {
  const columns = PUBLIC_PRODUCT_COLUMNS.split(",");
  for (const sensitive of SENSITIVE_PRODUCT_COLUMNS) {
    assert.ok(!columns.includes(sensitive), `${sensitive} must not be publicly selectable`);
  }
  // Columns needed by the public detail page are still present.
  for (const required of ["id", "seller_id", "title", "slug", "price", "preview_image_url", "view_count"]) {
    assert.ok(columns.includes(required), `${required} is required by the public page`);
  }
});

test("public category projection is a small explicit allowlist", () => {
  assert.equal(PUBLIC_CATEGORY_COLUMNS, "id,name,slug,description");
});
