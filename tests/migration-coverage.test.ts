import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const EXPECTED_MIGRATIONS = [
  "0001_init.sql",
  "0002_functions.sql",
  "0003_security_fixes.sql",
  "0004_public_column_privileges.sql",
  "0005_webhook_idempotency.sql",
  "0006_cloudflare_scan_queue.sql",
  "0007_notifications.sql",
  "0008_account_controls.sql",
  "0009_product_taxonomy.sql",
  "0010_workflow_fixes.sql",
  "0011_session_limits.sql",
  "0012_notification_coverage.sql",
];

const combinedPath = join(process.cwd(), "supabase", "ALL_MIGRATIONS_COMBINED.sql");
const migrationsDir = join(process.cwd(), "supabase", "migrations");

test("all migrations 0001-0012 exist and are combined in numeric order", () => {
  const combined = readFileSync(combinedPath, "utf8");
  let previousIndex = -1;

  for (const name of EXPECTED_MIGRATIONS) {
    assert.ok(existsSync(join(migrationsDir, name)), `${name} is missing from supabase/migrations`);
    const index = combined.indexOf(name);
    assert.ok(index >= 0, `${name} is missing from ALL_MIGRATIONS_COMBINED.sql`);
    assert.ok(index > previousIndex, `${name} appears out of numeric order`);
    previousIndex = index;
  }
});

test("combined migration file includes the new workflow RPC and credit spend type", () => {
  const combined = readFileSync(combinedPath, "utf8");
  const migration = readFileSync(join(migrationsDir, "0010_workflow_fixes.sql"), "utf8");
  assert.ok(combined.includes(migration.trim()), "0010 must be appended verbatim");
  assert.match(combined, /function public\.increment_view_count\(p_product_id uuid\)/);
  assert.match(combined, /'promotional_bonus', 'referral_bonus', 'reversal', 'expiry'/);
  assert.match(combined, /transaction_type in \('purchase', 'spend'\)/);
});

test("combined migration file includes the session-limit RPCs", () => {
  const combined = readFileSync(combinedPath, "utf8");
  const migration = readFileSync(join(migrationsDir, "0011_session_limits.sql"), "utf8");
  assert.ok(combined.includes(migration.trim()), "0011 must be appended verbatim");
  assert.match(combined, /function public\.enforce_user_session_limit/);
  assert.match(combined, /revoke_user_session\(uuid, uuid\) to service_role/);
});

test("combined migration file includes payment, refund, dispute and admin notification triggers", () => {
  const combined = readFileSync(combinedPath, "utf8");
  const migration = readFileSync(join(migrationsDir, "0012_notification_coverage.sql"), "utf8");
  assert.ok(combined.includes(migration.trim()), "0012 must be appended verbatim");
  for (const trigger of [
    "payment_notification",
    "refund_notification",
    "dispute_notification",
    "admin_activity_notification",
  ]) {
    assert.match(combined, new RegExp(`create trigger ${trigger}`));
  }
  assert.match(combined, /not exists \(select 1 from public\.users where id = p_user_id\)/);
});
