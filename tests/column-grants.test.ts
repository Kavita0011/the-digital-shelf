import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PUBLIC_CATEGORY_COLUMNS, PUBLIC_PRODUCT_COLUMNS } from "../src/lib/public-catalog";

const migration = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations", "0004_public_column_privileges.sql"),
  "utf8",
);

function grantedColumns(table: string): string[] {
  const pattern = new RegExp("grant\\s+select\\s+\\(([^)]*)\\)\\s+on\\s+public\\." + table, "i");
  const match = migration.match(pattern);
  assert.ok(match, `expected a column-level grant for public.${table}`);
  return match![1].split(",").map((column) => column.trim()).filter(Boolean).sort();
}

test("product column grants match the public server projection", () => {
  assert.deepEqual(grantedColumns("products"), PUBLIC_PRODUCT_COLUMNS.split(",").sort());
});

test("category column grants match the public server projection", () => {
  assert.deepEqual(grantedColumns("categories"), PUBLIC_CATEGORY_COLUMNS.split(",").sort());
});
