# The Digital Shelf

A curated digital-product marketplace built with **Next.js 15 (App Router) + TypeScript + Tailwind CSS**, **Supabase Postgres + Supabase Auth + Supabase Storage** (private bucket), and **VirusTotal** malware scanning. Stripe Checkout/Connect code is present but **Stripe is intentionally deferred until real keys are configured** (see below).

Sellers can upload but **never publish directly**: every file is validated by magic bytes, renamed to a UUID, stored in a private bucket, scanned by VirusTotal, and then manually approved by an admin. A **real VirusTotal API key is required before any upload can pass scanning**; there is no fake or bypass scanning in this repo.

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
│   │   │   ├── downloads/[token]/    single-use download gate → Storage signed URL
│   │   │   ├── checkout/ cart/       server-priced Stripe checkout (deferred until keys configured)
│   │   │   ├── payments/webhook/     verified, idempotent Stripe webhooks
│   │   │   ├── credits/              balance, history, Stripe credit packs (deferred)
│   │   │   ├── buyer/                orders, downloads, reports
│   │   │   ├── seller/connect/       Stripe Connect onboarding (deferred)
│   │   │   └── admin/                moderation, users, sellers, credits, refunds, audit, settings
│   │   ├── (public pages)            home, browse, categories, product, auth, legal
│   │   ├── buyer/ seller/ admin/    role dashboards
│   │   ├── layout.tsx globals.css
│   │   └── middleware.ts             session refresh + HttpOnly CSRF cookie
│   ├── components/                   upload wizard, admin tables, buy/download buttons
│   └── lib/                          auth, RBAC, CSRF, rate limit, audit, storage, malware,
│                                     file-security, credits, Stripe, validation, types
├── supabase/
│   ├── migrations/0001_init.sql      full schema, RLS, append-only triggers
│   ├── migrations/0002_functions.sql auth sync, credit redemption, token consumption
│   ├── migrations/0003_security_fixes.sql role whitelist, coupon/freeze RPCs, indexes
│   ├── migrations/0004_public_column_privileges.sql column-level anon grants
│   ├── migrations/0005_webhook_idempotency.sql retry-safe credits and payments
│   ├── migrations/0006_cloudflare_scan_queue.sql VirusTotal analysis id for queue workers
│   ├── migrations/0007_notifications.sql DB-triggered in-app notifications
│   ├── migrations/0008_account_controls.sql soft account deletion controls
│   ├── migrations/0009_product_taxonomy.sql content_type values and category refresh
│   ├── migrations/0010_workflow_fixes.sql atomic view-count RPC and credit spend type
│   ├── migrations/0011_session_limits.sql service-role session list/revoke/cap RPCs
│   ├── migrations/0012_notification_coverage.sql payment/refund/dispute/admin triggers
│   ├── ALL_MIGRATIONS_COMBINED.sql    all migrations 0001-0012 in numeric order
│   └── seed/seed.ts                  demo users, seller, products, audit entry
├── .env.example
├── package.json
└── README.md
```

---

## 2. Prerequisites

- Node.js 20+ (tested on Node 24)
- A Supabase project (Postgres 15+)
- A private Supabase Storage bucket (`npm run db:bucket` creates it)
- A **real** VirusTotal API key with file-scan access (required for uploads to pass scanning; no simulated scanning)
- Stripe account with Connect enabled **only if enabling payments** (real **test** keys for development); Stripe remains deferred until then
- `supabase` CLI (for migrations), Wrangler, and `git`
- A Cloudflare Workers account (for the OpenNext deployment path)
- A Cloudflare KV namespace and Queue for shared rate limits and background malware scans

---

## 3. Setup

```bash
npm install
cp .env.example .env.local
```

Fill in the required variables in `.env.local` with real values. Supabase and `SESSION_SECRET` are required at boot; VirusTotal and Stripe placeholders are accepted at boot but upload scanning requires a real `VT_FILESCAN_API_KEY`, and payments require real Stripe keys (currently deferred). No fake scan results are produced. Generate a session secret with:

```bash
openssl rand -hex 32
```

### Stripe webhook (deferred)

Stripe stays deferred until real keys are configured; the steps below apply only when you choose to enable it. Create a webhook endpoint pointing to `https://YOUR_DOMAIN/api/payments/webhook` and subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`
- `payment_intent.payment_failed`
- `charge.refunded`
- `charge.dispute.created`
- `payout.paid`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`. Use `stripe listen --forward-to localhost:3000/api/payments/webhook` locally.

### Private product storage

Create a **private** Supabase Storage bucket named `product-files` with `npm run db:bucket`. Only the server SDK ever creates download URLs. No public bucket URL is used for product files; all downloads go through `/api/downloads/[token]`, which expires the token and redirects to a short-lived signed GET URL.

### Database

```bash
npm run db:migrate     # supabase db push
npm run db:accounts    # super admin + test buyer + approved test seller
npm run db:bucket      # private product-files bucket
DEMO_PASSWORD='a-strong-demo-password' npm run db:seed
```

`db:accounts` reads `ADMIN_PASSWORD`, `ADMIN_TEST_PASSWORD`, and `TEST_PASSWORD` from `.env.local`; it never prints passwords. It creates/repairs `thedigitalshelf.admin@gmail.com` (super admin), `testadmin@example.com` (admin), `testuser@example.com` (buyer), and `testseller@example.com` (seller). It also gives the super-admin account an approved preview seller profile so **View mode → Seller** opens the seller dashboard correctly.

If you manage migrations manually, apply the SQL files in `supabase/migrations/` in numeric order (`0001`–`0012`), or apply `supabase/ALL_MIGRATIONS_COMBINED.sql`, which contains the same files verbatim in that order. `0003_security_fixes.sql` removes client-controlled role assignment from the auth trigger, adds atomic coupon/credit RPCs, and lets a single payment intent cover a multi-item cart. `0004_public_column_privileges.sql` restricts the anon key to public-only product/category columns, so a direct `select=*` REST call cannot read internal fields such as rejection notes or file checksums. `0005_webhook_idempotency.sql` makes credit redemption and payment recording safe to retry. `0006_cloudflare_scan_queue.sql` adds the VirusTotal analysis id used by the background scan queue. `0007_notifications.sql` adds DB-triggered notifications; `0008_account_controls.sql` adds soft account deletion; `0009_product_taxonomy.sql` adds `content_type` and the buyer-facing categories (already applied); `0010_workflow_fixes.sql` adds the atomic `increment_view_count()` RPC and a dedicated `spend` credit transaction type for checkout redemptions. `0011_session_limits.sql` adds service-role-only RPCs to list, revoke and cap Supabase Auth sessions. `0012_notification_coverage.sql` adds payment, refund, dispute and admin-activity notification triggers and guards notifications against deleted users.

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

CI runs the same four checks on every push and pull request (`npm test` includes the static route/CSRF and migration-coverage tests). It copies `.env.example` to `.env.local` for build-time placeholders only; no real secrets are ever committed.

---

## 3.1 Cloudflare Workers deployment

This app deploys to Cloudflare Workers with the OpenNext adapter. Supabase remains the Postgres/Auth provider; Stripe and VirusTotal remain external APIs.

Create the supporting Cloudflare resources first:

```bash
npx wrangler login
npx wrangler kv namespace create RATE_LIMIT_KV
npx wrangler queues create digital-shelf-scan
npx wrangler types --env-interface CloudflareEnv
```

Put the generated KV namespace id into `wrangler.jsonc` (`kv_namespaces[0].id`). Then set Cloudflare runtime secrets (never commit them). Required public values for the build are `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Add `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` **only when Stripe Checkout is enabled with real keys**; omit it while Stripe is deferred. All other values from `.env.example` are server-only runtime secrets.

Stop `next dev` before any build/preview/deploy command.

```bash
npm run typecheck
npm run lint
npm test
npm run preview
npm run deploy
```

For CI, use Workers Builds:

- Build command: `npm run build:cf`
- Deploy command: `npm run deploy:cf`

Do not use plain `npm run build` as the Workers Builds build command: it produces `.next` but not the `.open-next` output that the deploy step requires.

The custom `worker.ts` reuses the generated OpenNext fetch handler and adds a `queue` handler that polls VirusTotal. `next.config.mjs` calls `initOpenNextCloudflareForDev()` so `next dev` can resolve bindings locally. `MAX_UPLOAD_BYTES` is 25 MB on Workers because the complete route validates the file in memory.

---

## 4. Roles and access control

| Role | Key abilities |
|---|---|
| Guest | Browse approved products, categories, search, create buyer/seller account |
| Buyer | Cart, credits, purchases, gated downloads, reports (Stripe checkout deferred until real keys) |
| Seller | Create profile, upload products, resubmit rejected products, sales/earnings/payouts (Connect deferred) |
| Admin | Full moderation, users, orders, refunds, credits, reports, audit, exports |
| Super admin | Admin + platform settings, commission, limits, admin account management |

`requireUser()` / `requireRole()` enforce access on every API route. RLS is enabled on all tables, with public read only for `approved` products and categories and self-read for personal tables. All writes go through the server with a server-only service-role client.

### Super-admin user management and view-as mode

A **super admin** gets a **View mode** switcher on every admin page to preview the buyer, seller, or admin experience and return to the real admin account. They can also open `/admin/users` to:

- Change another user's role (buyer → seller → admin) through `PATCH /api/admin/users/[id]/role`. Self-targeting, peer targeting, and promotion to `super_admin` are all rejected; every change is written to the audit log with `from`/`to` metadata.
- Temporarily **view the site as a buyer, seller, or admin** through `POST /api/admin/impersonate`. This sets a 1-hour, HMAC-signed, HttpOnly cookie whose payload is bound to the admin's user ID. The stored account role is never modified; `getCurrentUser()` applies the override only to the *effective* role, and `realRole` always retains the true value. A prominent banner in every dashboard offers **Return to admin** (`DELETE /api/admin/impersonate`), which clears the cookie and restores full privileges. Impersonation start/stop is audited and rate-limited, and ordinary admins cannot use it.

There is no shared or hardcoded admin password. Register a normal account, then promote it in Supabase:

```sql
update public.users
set role = 'super_admin', status = 'active'
where lower(email) = lower('thedigitalshelf.admin@gmail.com');
```

### Auth email URLs and templates

In Supabase **Authentication → URL Configuration**, the Site URL must be the live Worker URL (`https://the-digital-shelf.devappkavita-3d9.workers.dev`), not `http://localhost:3000`. The Site URL is the default redirect target embedded in Supabase Auth emails, so leaving it as localhost makes confirmation/reset links open a developer's machine. The redirect allow-list contains the live URL and `http://localhost:3000/**` for local development only.

A branded confirmation email body is kept at `supabase/email-templates/confirm-signup.html`. Supabase's **free tier with the default email provider does not allow custom email templates** (the Management API returns `entitlement_required`, and the dashboard hides the editor). Until a custom SMTP provider is configured or the project is upgraded, Supabase's default wording is unavoidable; the production redirect link is fixed by the Site URL above. After SMTP is configured, paste that HTML into **Authentication → Emails → Confirm sign up**, or run `SUPABASE_ACCESS_TOKEN=... npm run email:template` (which PATCHes `mailer_templates_confirmation_content` via the Supabase Management API) and set the subject to `Confirm your The Digital Shelf email`. Do not add SMTP or access-token credentials to this repository.

### Signed-in devices and email confirmation

Each account may be signed in on **3 devices** at once. On every successful password login, `POST /api/auth/login` calls the service-role `enforce_user_session_limit()` RPC: the new session is always kept, the other sessions are ordered by last activity, and the oldest ones beyond the cap are deleted from `auth.sessions`. If enforcement fails, login fails closed and the new session is signed out. Account settings (`/buyer/settings`, `/seller/settings`, `/admin/settings`) show verification status and the active device list, with buttons to revoke one device or all other devices; the current session can only be ended with the normal logout button. Session actions are audited and CSRF-protected.

Settings also include **Resend confirmation email** for unverified accounts. The recipient is taken from the signed-in Supabase user, never from client input, and resends are rate-limited to one per 5 minutes per account.

### Notifications

In-app alerts are generated by database triggers so they fire regardless of which API route changed the data. Coverage includes orders, card and credit payments, credit wallet changes, product moderation, reports, seller/profile changes, user status/role changes, refunds, disputes and sensitive admin activity. `0012_notification_coverage.sql` closes the payment/refund/dispute/admin-activity gaps and prevents a deleted user from failing the source transaction.

`PATCH /api/notifications` is idempotent and returns the refreshed list plus unread count instead of a bare `updated: true`. The notifications page applies that response directly, and the header bell listens for the shared change event, refreshes on navigation, on tab focus and every 30 seconds while visible. This removes the stale badge and the apparent “mark read did nothing” failure.

---

## 5. Upload and moderation pipeline

1. Seller creates a draft (`POST /api/seller/products`) after seller approval.
2. `POST /api/uploads/presign` validates the filename, creates a `product_files` row, and returns a 15-minute Supabase Storage signed upload URL.
3. Client uploads bytes directly to the private Supabase Storage bucket.
4. `POST /api/uploads/complete` downloads the bytes server-side, verifies **magic-byte MIME**, size (25 MB on Workers), blocked extensions, and SHA-256 checksum, then submits the file to VirusTotal.
5. On Workers, a Cloudflare Queue consumer polls the analysis and updates the file; the browser polls `scan-status`. Clean → `pending_review`. Infected/failed → `rejected` with a stored reason and the object deleted.
6. Admin reviews scan metadata and approves, rejects (with reason), requests changes, hides, removes, restores, features, or permanently deletes (only when no order history).
7. Every transition writes an append-only audit record.

### Seller edit / rescan and admin request-changes

Admins can either **reject** (`PATCH /api/admin/products/[id]/reject`) or **request changes** (`PATCH /api/admin/products/[id]/request-changes`, with a 5–2000 character reason). Requesting changes reuses the existing `rejected` product status — no new status or DB constraint is introduced — stores a `Changes requested: …` reason, and records `kind: changes_requested` in the append-only audit log. The seller is notified that the product needs changes and sees the reason in `/seller/products`.

To fix it, the seller opens `/seller/products/[id]/edit` and saves through `PATCH /api/seller/products/[id]` (allowed only for `draft`/`rejected`). That edit sets status back to `draft` and **clears the old file id, format, size, checksum and rejection reason**, so stale scan results cannot be reused. A fresh upload + `POST /api/uploads/complete` is then required to re-run the **real** VirusTotal scan; a clean scan moves the product to `pending_review`, and `POST /api/seller/products/[id]/submit` accepts a linked, clean file from `draft`/`scanning`/`pending_review`. Metadata edits alone never republish a product, and clean scans never auto-approve it.

Accepted content types: PDF, PNG, JPG, WEBP, ZIP, MP4, MP3, DOCX, XLSX, PPTX. Executables, scripts, unknown extensions, and mismatched signatures are rejected. Stored filenames are UUID-based; the original name is metadata only.

---

## 6. Payments, credits and financial integrity

Stripe flows in this section are implemented but **intentionally deferred until real Stripe keys are configured**; with placeholder keys, checkout/payouts are not exercisable.

- Prices, discounts, taxes, commission and credit redemption are **recomputed on the server** from database values; no client-supplied amount is trusted.
- Stripe Checkout uses `application_fee_amount` and `transfer_data.destination` for Connect sellers. Single-seller carts route directly to that seller's connected account; multi-seller carts settle through the platform with per-seller ledger rows — split payments for multi-seller carts require Stripe Connect separate charges/transfers and are marked as a follow-up in this build.
- Webhooks verify `stripe-signature` against the raw request body and are idempotent via `webhook_events`.
- Credit balances are **never updated directly**: an insert into `credit_transactions` triggers a database function that computes `balance_before`/`balance_after`, moves the wallet atomically under `FOR UPDATE`, and rejects overdrafts. `credit_transactions`, `refunds`, `webhook_events`, and `audit_logs` are append-only via triggers. Buying credits is `purchase`; checkout redemptions are `spend` (migration 0010).
- Refunds reverse order state, restore credits when applicable, and are audited.
- Buyers retain download access if a product is later hidden/removed, unless the file is explicitly deleted for legal/security reasons.

---

## 7. Security notes

- HTTPS enforced at the edge / reverse proxy; HSTS, `nosniff`, `frame-ancestors` and referrer policies are set.
- Supabase Auth handles password hashing, sessions and reset flows; session cookies are HTTP-only, Secure and SameSite=Lax.
- Double-submit CSRF: `/api/csrf` issues one HttpOnly HMAC-signed cookie and returns the matching raw token to the browser; all mutating routes require it in `x-csrf-token`. The client fetches a fresh token for every mutation and retries once if a concurrent auth change rotates the cookie.
- Rate limits on login, registration, password reset, upload, checkout, reports and credit purchases. Limits use Cloudflare KV when the `RATE_LIMIT_KV` binding is present and an in-process LRU fallback locally; keep WAF rate-limit rules as the hard edge layer because KV is eventually consistent.
- All input is validated with Zod; database access uses PostgREST parameterized queries; user content is rendered escaped by React.
- Service-role key, Stripe secret key and VirusTotal key exist only in server modules.
- Audit log records actor, role, action, target, metadata, IP and user agent for important actions.

### Production hardening checklist

- **Cloudflare WAF managed rules:** enable the Cloudflare Managed Ruleset and OWASP Core Ruleset in **blocking** mode on the zone in front of the Worker.
- **Edge rate limits:** add Cloudflare rate-limit rules (e.g. 5 login attempts / minute, 10 API mutations / minute per IP) as the hard edge layer in front of the KV-based application limits. KV is eventually consistent and can be bypassed under high concurrency; the WAF is the authoritative control.
- **Bot protection / managed challenge:** enable Bot Fight Mode or a managed challenge on `/api/*`, `/login`, `/register`, and `/admin/*` to blunt credential stuffing and automated scraping.
- Keep Cloudflare WAF rate-limit rules enabled in front of the KV-based application limits.
- Generate strict Supabase types (`npx supabase gen types typescript`) and apply the `Database` generic in `src/lib/supabase.ts`.
- Add preview-image watermark generation at upload time (e.g. Sharp overlay) before storing previews in Supabase Storage — the current schema stores a preview URL supplied by the seller and the UI labels it as a watermarked preview.
- Consider migrating multi-seller payouts to Stripe separate charges and transfers.

---

## 8. Known scope notes

This is a functional production-oriented implementation, not a turnkey hosted service. Without real credentials, Stripe payments, private Storage uploads, VirusTotal scans and database migrations were not executed here. **Stripe stays intentionally deferred until real keys are configured**, and **a real VirusTotal key is required before uploads can pass scanning — no fake scanning is implemented**. The integration code targets the documented public APIs of each chosen vendor. The hardening checklist items (strict generated types, real preview watermarks, edge WAF rules, multi-seller payouts via separate charges/transfers) remain explicit follow-ups; the schema, auth/RBAC, upload → real scan → manual approval, seller rescan workflow, secure downloads, credits, dashboards, reports and audit logs are implemented in this repository.
