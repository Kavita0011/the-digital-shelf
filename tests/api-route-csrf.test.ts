import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";

/**
 * Static guard for the CSRF invariant: route() enforces CSRF on every mutating
 * method unless a route explicitly opts out. Only the Stripe webhook may be
 * unwrapped because it verifies the Stripe signature against the raw body.
 */
const API_ROOT = join(process.cwd(), "src", "app", "api");
const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;
const SIGNATURE_VERIFIED_ROUTES = new Set(["src/app/api/payments/webhook/route.ts"]);

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? routeFiles(path) : path.endsWith(`${sep}route.ts`) ? [path] : [];
  });
}

const files = routeFiles(API_ROOT).sort();

function relPath(file: string): string {
  return relative(process.cwd(), file).split(sep).join("/");
}

test("every mutating API handler is created through route()", () => {
  assert.ok(files.length > 40, `Expected to scan the full API tree, found ${files.length} route files`);

  const unwrapped: string[] = [];
  let handlerCount = 0;

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const rel = relPath(file);
    const initialized = [...source.matchAll(new RegExp(`export const (${MUTATING_METHODS.join("|")})\\s*=\\s*([^\\n;]*)`, "g"))];
    for (const match of initialized) {
      const [, method, initializer] = match;
      handlerCount += 1;
      if (/^route(?:<[^>]*>)?\s*\(/.test(initializer.trim())) continue;
      if (SIGNATURE_VERIFIED_ROUTES.has(rel) && /webhooks\.constructEvent\s*\(/.test(source)) continue;
      unwrapped.push(`${rel}: ${method} = ${initializer.trim()}`);
    }
  }

  assert.ok(handlerCount >= 30, `Expected mutating handlers to be present, found ${handlerCount}`);
  assert.deepEqual(unwrapped, [], "Mutating handlers must use route() so CSRF cannot be forgotten");
});

test("no API route opts out of CSRF with csrf: false", () => {
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.ok(
      !/csrf\s*:\s*false/.test(source),
      `${relPath(file)} opts out of CSRF protection`,
    );
  }
});
