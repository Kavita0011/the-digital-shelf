import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PUBLIC_CATEGORY_COLUMNS, PUBLIC_PRODUCT_COLUMNS } from "../src/lib/public-catalog";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const migrations = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

/** Column grants accumulate across migrations, so inspect all of them. */
function grantedColumns(table: string): string[] {
  const columns = new Set<string>();
  for (const file of migrations) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const pattern = new RegExp("grant\\s+select\\s*\\(([^)]*)\\)\\s+on\\s+public\\." + table, "gi");
    for (const match of sql.matchAll(pattern)) {
      for (const column of match[1].split(",")) {
        const trimmed = column.trim();
        if (trimmed) columns.add(trimmed);
      }
    }
  }
  assert.ok(columns.size > 0, `expected a column-level grant for public.${table}`);
  return [...columns].sort();
}

test("product column grants match the public server projection", () => {
  assert.deepEqual(grantedColumns("products"), PUBLIC_PRODUCT_COLUMNS.split(",").sort());
});

test("category column grants match the public server projection", () => {
  assert.deepEqual(grantedColumns("categories"), PUBLIC_CATEGORY_COLUMNS.split(",").sort());
});
