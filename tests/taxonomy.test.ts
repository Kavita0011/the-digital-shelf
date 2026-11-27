import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { CONTENT_TYPES } from "../src/lib/types";
import { categoryIcon } from "../src/lib/category-taxonomy";

const taxonomySql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "0009_product_taxonomy.sql"),
  "utf8",
);

test("content types in TypeScript match the database check constraint", () => {
  const constraintBlock = taxonomySql.match(/add constraint products_content_type_check[\s\S]*?\);/)?.[0] ?? "";
  const sqlTypes = [...constraintBlock.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
  assert.deepEqual(sqlTypes, [...CONTENT_TYPES]);
});

test("every taxonomy category has a buyer-facing icon", () => {
  const insertBlock = taxonomySql.match(/insert into public\.categories[\s\S]*?on conflict \(slug\)/)?.[0] ?? "";
  const slugs = [...insertBlock.matchAll(/^\s*\('[^']+',\s*'([a-z0-9-]+)'/gm)].map((match) => match[1]);
  assert.equal(slugs.length, 10);
  for (const slug of slugs) {
    assert.notEqual(categoryIcon(slug), "✨", `Missing icon for category ${slug}`);
  }
  assert.equal(categoryIcon("not-a-category"), "✨");
});
