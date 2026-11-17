# The Digital Shelf

A curated digital-product marketplace built with **Next.js 15 (App Router) + TypeScript + Tailwind CSS**, **Supabase Postgres + Supabase Auth**, **Cloudflare R2** private storage, **VirusTotal** malware scanning, and **Stripe Checkout + Stripe Connect**.

Sellers can upload but **never publish directly**: every file is validated by magic bytes, renamed to a UUID, stored in a private bucket, scanned by VirusTotal, and then manually approved by an admin.

---

## 1. Project structure

```
.
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/                 register, login, logout, me, forgot/reset password
│   │   │   ├── products/             public browse, search, categories, detail
│   │   │   ├── seller/products/      seller CRUD + submit for review
│   │   │   ├── uploads/              presign, complete (scan), scan-status
│   │   │   ├── downloads/[token]/    single-use download gate → R2 signed URL
│   │   │   ├── checkout/ cart/       server-priced Stripe checkout
│   │   │   ├── payments/webhook/     verified, idempotent Stripe webhooks
│   │   │   ├── credits/              balance, history, Stripe credit packs
│   │   │   ├── buyer/                orders, downloads, reports
│   │   │   ├── seller/connect/       Stripe Connect onboarding
│   │   │   └── admin/                moderation, users, sellers, credits, refunds, audit, settings
│   │   ├── (public pages)            home, browse, categories, product, auth, legal
│   │   ├── buyer/ seller/ admin/    role dashboards
│   │   ├── layout.tsx globals.css
│   │   └── middleware.ts             session refresh + HttpOnly CSRF cookie
│   ├── components/                   upload wizard, admin tables, buy/download buttons
│   └── lib/                          auth, RBAC, CSRF, rate limit, audit, R2, malware,
│                                     file-security, credits, Stripe, validation, types
├── supabase/
│   ├── migrations/0001_init.sql      full schema, RLS, append-only triggers
│   ├── migrations/0002_functions.sql auth sync, credit redemption, token consumption
│   ├── migrations/0003_security_fixes.sql role whitelist, coupon/freeze RPCs, indexes
│   ├── migrations/0004_public_column_privileges.sql column-level anon grants
│   ├── migrations/0005_webhook_idempotency.sql retry-safe credits and payments
│   └── seed/seed.ts                  demo users, seller, products, audit entry
├── .env.example
├── package.json
└── README.md
```

---

## 2. Prerequisites

- Node.js 20+ (tested on Node 24)
- A Supabase project (Postgres 15+)
- A Cloudflare R2 bucket (private, no public access)
- A VirusTotal API key with file-scan access
- Stripe account with Connect enabled (real **test** keys for development)
- `supabase` CLI (for migrations) and `git`

---

## 3. Setup

```bash
npm install
cp .env.example .env.local
```

Fill in **every** variable in `.env.local` with real values. The app deliberately refuses to boot with placeholder/empty secrets. Generate a session secret with:

```bash
openssl rand -hex 32
```

### Stripe webhook

Create a webhook endpoint pointing to `https://YOUR_DOMAIN/api/payments/webhook` and subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`
- `payment_intent.payment_failed`
- `charge.refunded`
- `charge.dispute.created`
- `payout.paid`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`. Use `stripe listen --forward-to localhost:3000/api/payments/webhook` locally.

### R2 bucket

Create a **private** bucket. Only the server SDK ever touches it. No public bucket URL is used for product files; all downloads go through `/api/downloads/[token]`, which expires the token and redirects to a 10-minute presigned GET URL. CORS: allow `PUT` from your app origin for presigned uploads.

### Database

```bash
npm run db:migrate     # supabase db push
DEMO_PASSWORD='a-strong-demo-password' npm run db:seed
```

If you manage migrations manually, apply the SQL files in `supabase/migrations/` in numeric order (`0001`–`0005`). `0003_security_fixes.sql` removes client-controlled role assignment from the auth trigger, adds atomic coupon/credit RPCs, and lets a single payment intent cover a multi-item cart. `0004_public_column_privileges.sql` restricts the anon key to public-only product/category columns, so a direct `select=*` REST call cannot read internal fields such as rejection notes or file checksums. `0005_webhook_idempotency.sql` makes credit redemption and payment recording safe to retry, and the webhook debits credits before marking an order paid.

```bash
npm run dev            # http://localhost:3000
```

Verify:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

CI runs the same four checks on every push and pull request. It copies `.env.example` to `.env.local` for build-time placeholders only; no real secrets are ever committed.

---

## 4. Roles and access control

| Role | Key abilities |
|---|---|
| Guest | Browse approved products, categories, search, create buyer/seller account |
| Buyer | Cart, Stripe checkout, credits, purchases, gated downloads, reports |
| Seller | Create profile, upload products, resubmit rejected products, sales/earnings/payouts |
| Admin | Full moderation, users, orders, refunds, credits, reports, audit, exports |
| Super admin | Admin + platform settings, commission, limits, admin account management |

`requireUser()` / `requireRole()` enforce access on every API route. RLS is enabled on all tables, with public read only for `approved` products and categories and self-read for personal tables. All writes go through the server with a server-only service-role client.

---

## 5. Upload and moderation pipeline

1. Seller creates a draft (`POST /api/seller/products`) after seller approval.
2. `POST /api/uploads/presign` validates the filename, creates a `product_files` row, and returns a 15-minute R2 presigned PUT URL.
3. Client uploads bytes directly to R2.
4. `POST /api/uploads/complete` downloads the bytes server-side, verifies **magic-byte MIME**, size (100 MB), blocked extensions, and SHA-256 checksum, then submits the file to VirusTotal.
5. Clean → `pending_review`. Infected/failed → `rejected` with a stored reason.
6. Admin reviews scan metadata and approves, rejects (with reason), requests changes, hides, removes, restores, features, or permanently deletes (only when no order history).
7. Every transition writes an append-only audit record.

Accepted content types: PDF, PNG, JPG, WEBP, ZIP, MP4, MP3, DOCX, XLSX, PPTX. Executables, scripts, unknown extensions, and mismatched signatures are rejected. Stored filenames are UUID-based; the original name is metadata only.

---

## 6. Payments, credits and financial integrity

- Prices, discounts, taxes, commission and credit redemption are **recomputed on the server** from database values; no client-supplied amount is trusted.
- Stripe Checkout uses `application_fee_amount` and `transfer_data.destination` for Connect sellers. Single-seller carts route directly to that seller's connected account; multi-seller carts settle through the platform with per-seller ledger rows — split payments for multi-seller carts require Stripe Connect separate charges/transfers and are marked as a follow-up in this build.
- Webhooks verify `stripe-signature` against the raw request body and are idempotent via `webhook_events`.
- Credit balances are **never updated directly**: an insert into `credit_transactions` triggers a database function that computes `balance_before`/`balance_after`, moves the wallet atomically under `FOR UPDATE`, and rejects overdrafts. `credit_transactions`, `refunds`, `webhook_events`, and `audit_logs` are append-only via triggers.
- Refunds reverse order state, restore credits when applicable, and are audited.
- Buyers retain download access if a product is later hidden/removed, unless the file is explicitly deleted for legal/security reasons.

---

## 7. Security notes

- HTTPS enforced at the edge / reverse proxy; HSTS, `nosniff`, `frame-ancestors` and referrer policies are set.
- Supabase Auth handles password hashing, sessions and reset flows; session cookies are HTTP-only, Secure and SameSite=Lax.
- Double-submit CSRF: middleware sets an HttpOnly HMAC-signed cookie; `/api/csrf` returns the raw token to the browser; all mutating routes require it in `x-csrf-token`.
- Rate limits on login, registration, password reset, upload, checkout, reports and credit purchases (in-process LRU; replace with Redis/Upstash for multi-instance deployments).
- All input is validated with Zod; database access uses PostgREST parameterized queries; user content is rendered escaped by React.
- Service-role key, Stripe secret key, R2 credentials and VirusTotal key exist only in server modules.
- Audit log records actor, role, action, target, metadata, IP and user agent for important actions.

### Production hardening checklist

- Move rate limiting to a shared store (Upstash/Redis).
- Add a CDN/WAF and strict CSP.
- Generate strict Supabase types (`npx supabase gen types typescript`) and apply the `Database` generic in `src/lib/supabase.ts`.
- Add preview-image watermark generation at upload time (e.g. Sharp overlay) before storing previews in R2 — the current schema stores a preview URL supplied by the seller and the UI labels it as a watermarked preview.
- Consider migrating multi-seller payouts to Stripe separate charges and transfers.

---

## 8. Known scope notes

This is a functional production-oriented implementation, not a turnkey hosted service. Without your real credentials I could not execute Stripe payments, R2 uploads, VirusTotal scans or database migrations here. The integration code targets the documented public APIs of each chosen vendor. The items in the hardening checklist above are explicit follow-ups; everything else in the brief — schema, auth/RBAC, upload → scan → approval, secure downloads, credits, Stripe, dashboards, reports and audit logs — is implemented in this repository.
