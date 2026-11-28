import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("product checkout is credit-only, with no Stripe or card path", () => {
  const source = read("src/app/api/checkout/route.ts");

  assert.match(source, /Product checkout is credit-only/);
  assert.doesNotMatch(source, /getStripe|stripe\.checkout|checkout\.sessions\.create/);
  assert.doesNotMatch(source, /getOrCreateStripeCustomer/);
  assert.match(source, /card_amount: 0/);
  assert.match(source, /payment_method: "credits"/);
  assert.match(source, /wallet\.balance < totalCredits/);
  assert.match(source, /HttpError\(\s*402/);
  assert.match(source, /redeem_credits/);
});

test("seller form and buyer pages display prices in credits", () => {
  const wizard = read("src/components/upload-wizard.tsx");
  const sellerProducts = read("src/app/seller/products/page.tsx");
  const productCard = read("src/components/product-card.tsx");
  const productDetail = read("src/app/products/[slug]/page.tsx");
  const cart = read("src/app/cart/page.tsx");

  assert.match(wizard, /Price \(credits\)/);
  assert.match(wizard, /1 credit = \$0\.01/);
  assert.match(wizard, /Math\.max\(0, Math\.round\(Number\(fd\.get\("price"\)\)\)\)/);
  assert.doesNotMatch(wizard, /Number\(fd\.get\("price"\)\) \* 100/);
  assert.match(sellerProducts, /\{Number\(p\.price\)\} credits/);
  assert.match(productCard, /\{Number\(product\.price\)\} credits/);
  assert.match(productDetail, /\{Number\(product\.price\)\} credits/);
  assert.match(cart, /Total: \{total\} credits/);
});
