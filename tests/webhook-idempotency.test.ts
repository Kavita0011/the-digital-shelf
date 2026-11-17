import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(join(root, "supabase", "migrations", "0005_webhook_idempotency.sql"), "utf8");
const webhook = readFileSync(join(root, "src", "app", "api", "payments", "webhook", "route.ts"), "utf8");

test("credit redemption is guarded by a per-order unique index and an early return", () => {
  assert.match(migration, /create unique index if not exists credit_tx_order_debit_uidx/);
  assert.match(migration, /if found then return tx_id; end if;/);
});

test("payment recording is unique per order/intent and per credit-pack intent", () => {
  assert.match(migration, /payments_order_intent_uidx/);
  assert.match(migration, /payments_credit_intent_uidx/);
});

test("the webhook debits credits before granting paid access", () => {
  const redeemAt = webhook.indexOf('db.rpc("redeem_credits"');
  const paidAt = webhook.indexOf('payment_status: "paid", paid_at');
  assert.ok(redeemAt > 0, "expected a credit redemption call in the webhook");
  assert.ok(paidAt > redeemAt, "an order must not be marked paid before its credits are debited");
});

test("credit-pack fulfillment is guarded against repeated deliveries", () => {
  assert.match(webhook, /priorPayments\?\.length\) break;/);
});
