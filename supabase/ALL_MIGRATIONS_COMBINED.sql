-- The Digital Shelf - combined migrations (idempotent)
-- Generated 2026-11-27 from supabase/migrations/0001..0010 in numeric order.

-- ===== 0001_init.sql =====
-- The Digital Shelf — initial schema
-- Run with: supabase db push  (or psql -f against a Postgres 15+ database)
-- Design notes:
--   * All money is integer minor units (cents) to avoid floating point drift.
--   * Financial / audit / credit tables are append-only via triggers.
--   * Credit balances are derived by wallet triggers from credit_transactions;
--     no client or API may UPDATE balance directly.
--   * RLS is enabled everywhere: application uses service role (server-only)
--     while anon/authenticated roles get tightly scoped public read policies.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------------
-- users (mirrors auth.users; linked by same UUID)
-- ---------------------------------------------------------------------------
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  password_hash text, -- Supabase Auth stores hashes; kept nullable for OAuth future use
  full_name text,
  role text not null default 'buyer' check (role in ('buyer','seller','admin','super_admin')),
  status text not null default 'active' check (status in ('active','suspended','banned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace trigger users_updated before update on users for each row execute function set_updated_at();

create table if not exists seller_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  store_name text not null,
  bio text,
  profile_image text,
  stripe_connect_account_id text unique,
  payout_status text not null default 'not_connected',
  verification_status text not null default 'pending',
  upload_limit integer not null default 25 check (upload_limit > 0),
  created_at timestamptz not null default now()
);

create table if not exists buyer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  stripe_customer_id text unique,
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references seller_profiles(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 200),
  slug text not null unique,
  description text not null check (char_length(description) between 20 and 20000),
  short_description text not null check (char_length(short_description) between 10 and 300),
  category_id uuid references categories(id) on delete set null,
  tags text[] not null default '{}',
  price integer not null check (price >= 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  status text not null default 'draft' check (status in
    ('draft','uploading','scanning','pending_review','approved','rejected','hidden','removed')),
  rejection_reason text,
  preview_image_url text,
  file_id uuid,
  file_format text,
  file_size bigint,
  file_checksum text,
  license_type text not null default 'personal'
    check (license_type in ('personal','commercial','extended_commercial')),
  is_featured boolean not null default false,
  download_count bigint not null default 0,
  view_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references users(id) on delete set null
);
create or replace trigger products_updated before update on products for each row execute function set_updated_at();
create index if not exists products_public_idx on products(status, is_featured desc, created_at desc)
  where status = 'approved';
create index if not exists products_seller_idx on products(seller_id, status);
create index if not exists products_search_idx on products using gin ((title || ' ' || short_description) gin_trgm_ops);

create table if not exists product_files (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  stored_filename text not null unique,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  checksum text not null,
  scan_status text not null default 'pending'
    check (scan_status in ('pending','scanning','clean','infected','failed','skipped')),
  scan_provider text,
  scan_result jsonb,
  uploaded_at timestamptz not null default now()
);
alter table products drop constraint if exists products_file_fk;
alter table products add constraint products_file_fk
  foreign key (file_id) references product_files(id) on delete set null;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references users(id) on delete restrict,
  seller_id uuid not null references seller_profiles(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  order_number text not null unique,
  subtotal integer not null check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  credits_used integer not null default 0 check (credits_used >= 0),
  card_amount integer not null default 0 check (card_amount >= 0),
  tax integer not null default 0 check (tax >= 0),
  total_paid integer not null check (total_paid >= 0),
  platform_commission integer not null default 0 check (platform_commission >= 0),
  seller_earnings integer not null default 0 check (seller_earnings >= 0),
  payment_status text not null default 'pending' check (payment_status in
    ('pending','paid','failed','refunded','partially_refunded','disputed')),
  stripe_payment_intent_id text unique,
  stripe_checkout_session_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists orders_buyer_idx on orders(buyer_id, created_at desc);
create index if not exists orders_seller_idx on orders(seller_id, created_at desc);
create index if not exists orders_intent_idx on orders(stripe_payment_intent_id);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete restrict,
  user_id uuid not null references users(id) on delete restrict,
  payment_method text not null,
  amount integer not null check (amount >= 0),
  currency text not null default 'usd',
  credits_used integer not null default 0,
  status text not null check (status in
    ('pending','succeeded','failed','refunded','partially_refunded','disputed')),
  stripe_payment_intent_id text,
  receipt_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace trigger payments_updated before update on payments for each row execute function set_updated_at();
create index if not exists payments_user_idx on payments(user_id, created_at desc);
create index if not exists payments_order_idx on payments(order_id);

create table if not exists credit_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  balance integer not null default 0,
  pending_balance integer not null default 0,
  frozen_balance integer not null default 0,
  currency text not null default 'usd',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_nonnegative check (balance >= 0 and pending_balance >= 0 and frozen_balance >= 0)
);
create or replace trigger wallets_updated before update on credit_wallets for each row execute function set_updated_at();

create table if not exists credit_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references credit_wallets(id) on delete restrict,
  user_id uuid not null references users(id) on delete restrict,
  amount integer not null,
  transaction_type text not null check (transaction_type in
    ('purchase','refund','admin_grant','admin_deduction','promotional_bonus',
     'referral_bonus','reversal','expiry')),
  balance_before integer not null,
  balance_after integer not null,
  related_order_id uuid references orders(id) on delete set null,
  related_payment_id uuid references payments(id) on delete set null,
  admin_id uuid references users(id) on delete set null,
  reason text,
  status text not null default 'completed' check (status in
    ('completed','pending','reversed','expired','frozen')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists credit_tx_user_idx on credit_transactions(user_id, created_at desc);
create index if not exists credit_tx_wallet_idx on credit_transactions(wallet_id, created_at desc);

create table if not exists downloads (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  user_id uuid not null references users(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  file_id uuid not null references product_files(id) on delete restrict,
  download_token text not null unique,
  ip_address inet,
  user_agent text,
  downloaded_at timestamptz,
  expires_at timestamptz not null
);
create index if not exists downloads_order_idx on downloads(order_id);

create table if not exists product_reports (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  reporter_id uuid not null references users(id) on delete restrict,
  reason text not null check (reason in ('copyright','malware','misleading','quality','other')),
  details text not null check (char_length(details) between 10 and 5000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists reports_status_idx on product_reports(status, created_at desc);

create table if not exists refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  payment_id uuid references payments(id) on delete restrict,
  amount integer not null check (amount > 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','succeeded','failed')),
  stripe_refund_id text unique,
  admin_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists carts (
  user_id uuid not null references users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table carts enable row level security;

create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  percent_off integer not null default 0 check (percent_off between 0 and 100),
  amount_off integer not null default 0 check (amount_off >= 0),
  active boolean not null default true,
  max_uses integer not null default 0,
  uses integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  stripe_dispute_id text not null unique,
  amount integer not null,
  status text not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace trigger disputes_updated before update on disputes for each row execute function set_updated_at();

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references users(id) on delete set null,
  actor_role text not null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}',
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists audit_created_idx on audit_logs(created_at desc);
create index if not exists audit_actor_idx on audit_logs(actor_id, created_at desc);

create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create or replace trigger settings_updated before update on settings for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Immutable financial / audit records
-- ---------------------------------------------------------------------------
create or replace function forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'Immutable table: % is append-only', TG_TABLE_NAME;
end $$;

create or replace trigger audit_logs_immutable before update or delete on audit_logs
  for each row execute function forbid_mutation();
create or replace trigger credit_transactions_immutable before update or delete on credit_transactions
  for each row execute function forbid_mutation();
create or replace trigger refunds_immutable before update or delete on refunds
  for each row execute function forbid_mutation();
create or replace trigger webhook_events_immutable before update or delete on webhook_events
  for each row execute function forbid_mutation();

-- Wallet balance can only move through credit_transactions.
-- The transaction's BEFORE INSERT trigger derives balance_before/after and
-- applies the delta atomically. A transaction-local flag lets ONLY that path
-- update the wallet, while all direct API/console balance edits are refused.
create or replace function apply_credit_transaction() returns trigger
language plpgsql as $$
declare
  current_balance integer;
  new_balance integer;
begin
  if TG_OP = 'INSERT' then
    select balance into current_balance from credit_wallets where id = NEW.wallet_id for update;
    if not found then raise exception 'Wallet not found'; end if;
    new_balance := current_balance + NEW.amount;
    if new_balance < 0 then raise exception 'Insufficient credits'; end if;
    NEW.balance_before := current_balance;
    NEW.balance_after := new_balance;
    perform set_config('app.credit_update', 'on', true);
    update credit_wallets set balance = new_balance where id = NEW.wallet_id;
    perform set_config('app.credit_update', 'off', true);
  end if;
  return NEW;
end $$;

create or replace trigger credit_tx_apply
before insert on credit_transactions
for each row execute function apply_credit_transaction();

create or replace function guard_wallet_balance() returns trigger
language plpgsql as $$
begin
  if (NEW.balance is distinct from OLD.balance
      or NEW.pending_balance is distinct from OLD.pending_balance
      or NEW.frozen_balance is distinct from OLD.frozen_balance)
     and coalesce(current_setting('app.credit_update', true), 'off') <> 'on' then
    raise exception 'Wallet balances may only change via credit_transactions';
  end if;
  return NEW;
end $$;
create or replace trigger wallet_balance_guard before update on credit_wallets
  for each row execute function guard_wallet_balance();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table users enable row level security;
alter table seller_profiles enable row level security;
alter table buyer_profiles enable row level security;
alter table products enable row level security;
alter table product_files enable row level security;
alter table orders enable row level security;
alter table payments enable row level security;
alter table credit_wallets enable row level security;
alter table credit_transactions enable row level security;
alter table downloads enable row level security;
alter table product_reports enable row level security;
alter table refunds enable row level security;
alter table disputes enable row level security;
alter table webhook_events enable row level security;
alter table audit_logs enable row level security;
alter table settings enable row level security;
alter table categories enable row level security;
alter table coupons enable row level security;

-- Public read of approved products and categories (anon + authenticated).
drop policy if exists products_public_read on products;
create policy products_public_read on products for select
  using (status = 'approved');
drop policy if exists categories_public_read on categories;
create policy categories_public_read on categories for select using (true);

-- Owner-only reads for personal tables; all writes go through server API
-- using the service role key, which bypasses RLS.
drop policy if exists users_self_read on users;
create policy users_self_read on users for select
  using (id = auth.uid());
drop policy if exists seller_self_read on seller_profiles;
create policy seller_self_read on seller_profiles for select
  using (user_id = auth.uid());
drop policy if exists buyer_self_read on buyer_profiles;
create policy buyer_self_read on buyer_profiles for select
  using (user_id = auth.uid());
drop policy if exists wallet_self_read on credit_wallets;
create policy wallet_self_read on credit_wallets for select
  using (user_id = auth.uid());
drop policy if exists credit_tx_self_read on credit_transactions;
create policy credit_tx_self_read on credit_transactions for select
  using (user_id = auth.uid());
drop policy if exists orders_self_read on orders;
create policy orders_self_read on orders for select
  using (buyer_id = auth.uid());
drop policy if exists payments_self_read on payments;
create policy payments_self_read on payments for select
  using (user_id = auth.uid());
drop policy if exists downloads_self_read on downloads;
create policy downloads_self_read on downloads for select
  using (user_id = auth.uid());

-- No anon/authenticated direct write policies: mutating requests must
-- traverse the server API, where RBAC, CSRF, rate limits and audits live.

-- ---------------------------------------------------------------------------
-- Default settings
-- ---------------------------------------------------------------------------
insert into settings(key, value) values
  ('commission_rate_percent', '10'::jsonb),
  ('max_products_per_seller', '25'::jsonb),
  ('max_platform_products', '5000'::jsonb),
  ('max_upload_bytes', '104857600'::jsonb),
  ('credit_expiry_days', '365'::jsonb),
  ('allow_repeat_downloads', 'false'::jsonb),
  ('allow_credit_transfers', 'false'::jsonb),
  ('tax_rate_percent', '0'::jsonb)
on conflict (key) do nothing;

insert into categories(name, slug, description) values
  ('Canva Templates','canva-templates','Editable Canva designs'),
  ('Notion Templates','notion-templates','Productivity systems for Notion'),
  ('Planners & Printables','planners-printables','Printable planning tools'),
  ('Resume Templates','resume-templates','Professional resume layouts'),
  ('Social Media Templates','social-media-templates','Posts, stories and reels'),
  ('Ebooks & Guides','ebooks-guides','Long-form digital reads'),
  ('AI Prompt Packs','ai-prompt-packs','Curated prompt collections'),
  ('Digital Art & Clipart','digital-art-clipart','Illustrations and assets'),
  ('Business Documents','business-documents','Spreadsheets, docs and slides')
on conflict (name) do nothing;


-- ===== 0002_functions.sql =====
-- The Digital Shelf — database functions & auth sync

-- Mirror new Supabase Auth users into public.users.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users(id, email, full_name, role)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'full_name', ''),
    coalesce(nullif(new.raw_user_meta_data->>'role', '')::text, 'buyer')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create or replace trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Create a wallet for every user.
create or replace function handle_new_wallet() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.credit_wallets(user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_user_wallet_created on users;
create or replace trigger on_user_wallet_created after insert on users
  for each row execute function handle_new_wallet();

-- Atomically redeem credits for an order. Called by checkout service with
-- service-role key; cannot overdraw because trigger raises on negative.
create or replace function redeem_credits(
  p_user_id uuid,
  p_amount integer,
  p_order_id uuid,
  p_payment_id uuid default null,
  p_reason text default 'Credit redemption at checkout'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  w_id uuid;
  tx_id uuid;
begin
  select id into w_id from credit_wallets where user_id = p_user_id for update;
  if not found then raise exception 'Wallet not found for user'; end if;
  insert into credit_transactions(
    wallet_id, user_id, amount, transaction_type, related_order_id,
    related_payment_id, reason, status
  ) values (
    w_id, p_user_id, -p_amount, 'purchase', p_order_id,
    p_payment_id, p_reason, 'completed'
  ) returning id into tx_id;
  return tx_id;
end $$;

-- Atomically check-and-consume a single-download token.
create or replace function consume_download_token(
  p_token text,
  p_user_id uuid
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  d downloads%rowtype;
  repeat_ok boolean;
begin
  select * into d from downloads where download_token = p_token and user_id = p_user_id for update;
  if not found then return false; end if;
  if d.downloaded_at is not null then
    select coalesce((value::text)::boolean, false) into repeat_ok
      from settings where key = 'allow_repeat_downloads';
    if not repeat_ok then return false; end if;
  end if;
  if d.expires_at < now() then return false; end if;
  update downloads set downloaded_at = coalesce(downloaded_at, now()) where id = d.id;
  return true;
end $$;

revoke all on function redeem_credits(uuid, integer, uuid, uuid, text) from public, anon, authenticated;
revoke all on function consume_download_token(text, uuid) from public, anon, authenticated;
grant execute on function redeem_credits(uuid, integer, uuid, uuid, text) to service_role;
grant execute on function consume_download_token(text, uuid) to service_role;


-- ===== 0003_security_fixes.sql =====
-- The Digital Shelf — security and correctness hardening (P0)
-- Apply after 0001_init.sql and 0002_functions.sql.

-- 1. Remove the privilege escalation in the auth user trigger.
-- Roles are never taken from client-controlled signup metadata. Public
-- signups are always buyers; sellers are promoted by the server-only register
-- route, and admin/super_admin only by an explicit service-role action.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users(id, email, full_name, role)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'full_name', ''),
    'buyer'
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

-- 2. Reject invalid credit redemption amounts. A negative value would credit
-- a wallet instead of debiting it.
create or replace function redeem_credits(
  p_user_id uuid,
  p_amount integer,
  p_order_id uuid,
  p_payment_id uuid default null,
  p_reason text default 'Credit redemption at checkout'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  w_id uuid;
  tx_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Credit redemption amount must be positive';
  end if;
  select id into w_id from credit_wallets where user_id = p_user_id for update;
  if not found then raise exception 'Wallet not found for user'; end if;
  insert into credit_transactions(
    wallet_id, user_id, amount, transaction_type, related_order_id,
    related_payment_id, reason, status
  ) values (
    w_id, p_user_id, -p_amount, 'purchase', p_order_id,
    p_payment_id, p_reason, 'completed'
  ) returning id into tx_id;
  return tx_id;
end $$;

-- 3. Atomic, case-insensitive, single-use coupon redemption.
create or replace function apply_coupon(p_code text)
returns table (percent_off integer, amount_off integer)
language plpgsql security definer set search_path = public as $$
declare
  c coupons%rowtype;
begin
  if p_code is null or length(btrim(p_code)) = 0 then return; end if;
  select * into c from coupons
    where upper(code) = upper(btrim(p_code)) and active = true
    for update;
  if not found then return; end if;
  if c.max_uses <> 0 and c.uses >= c.max_uses then return; end if;
  update coupons set uses = uses + 1 where id = c.id;
  return query select c.percent_off, c.amount_off;
end $$;

revoke all on function apply_coupon(text) from public, anon, authenticated;
grant execute on function apply_coupon(text) to service_role;

-- 4. Make the admin "freeze" action real: move credits from available to
-- frozen under a row lock, instead of inserting a meaningless zero transaction.
create or replace function freeze_credits(p_user_id uuid, p_amount integer)
returns void
language plpgsql security definer set search_path = public as $$
declare
  w_id uuid;
  bal integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Freeze amount must be positive';
  end if;
  select id, balance into w_id, bal from credit_wallets where user_id = p_user_id for update;
  if not found then raise exception 'Wallet not found for user'; end if;
  if bal < p_amount then raise exception 'Insufficient credits'; end if;
  perform set_config('app.credit_update', 'on', true);
  update credit_wallets
    set balance = bal - p_amount, frozen_balance = frozen_balance + p_amount
    where id = w_id;
  perform set_config('app.credit_update', 'off', true);
  insert into credit_transactions(wallet_id, user_id, amount, transaction_type, reason, status)
  values (w_id, p_user_id, 0, 'admin_grant', 'Credits frozen by administrator', 'frozen');
end $$;

revoke all on function freeze_credits(uuid, integer) from public, anon, authenticated;
grant execute on function freeze_credits(uuid, integer) to service_role;

-- 5. A single Stripe payment intent covers every order in a multi-item cart,
-- so orders.stripe_payment_intent_id cannot be unique. Keep the lookup index.
alter table orders drop constraint if exists orders_stripe_payment_intent_id_key;
create index if not exists orders_intent_idx on orders(stripe_payment_intent_id);

-- 6. Indexes for the filters used by admin audit logs and coupon lookups.
create index if not exists audit_logs_action_idx on audit_logs(action, created_at desc);
create index if not exists coupons_code_trgm_idx on coupons using gin (upper(code) gin_trgm_ops);


-- ===== 0004_public_column_privileges.sql =====
-- RLS restricts which product ROWS an anonymous/authenticated client can see,
-- but it does not restrict COLUMNS. Without column privileges, a client using
-- the publishable anon key could call the REST endpoint with `select=*` and
-- read internal fields such as rejection_reason, file_checksum, file_id and
-- approved_by. Server-side reads use the service role and are unaffected.

revoke select on public.products from anon, authenticated;
grant select (
  id,
  seller_id,
  title,
  slug,
  description,
  short_description,
  category_id,
  tags,
  price,
  currency,
  status,
  preview_image_url,
  file_format,
  file_size,
  license_type,
  is_featured,
  view_count,
  created_at,
  approved_at
) on public.products to anon, authenticated;

-- Categories hold only public metadata today; keep an explicit allowlist so
-- any future internal column is not exposed automatically.
revoke select on public.categories from anon, authenticated;
grant select (id, name, slug, description) on public.categories to anon, authenticated;


-- ===== 0005_webhook_idempotency.sql =====
-- Stripe may deliver the same event more than once, and our own processing can
-- fail partway through. Make credit redemption and payment recording safe to
-- retry so a delivery can never double-charge a wallet or duplicate a payment.

-- At most one completed credit debit per order.
create unique index if not exists credit_tx_order_debit_uidx
  on credit_transactions (related_order_id)
  where related_order_id is not null
    and transaction_type = 'purchase'
    and amount < 0
    and status = 'completed';

-- At most one Stripe payment row per order/intent pair.
create unique index if not exists payments_order_intent_uidx
  on payments (order_id, stripe_payment_intent_id)
  where order_id is not null and stripe_payment_intent_id is not null;

-- Credit-pack payments have no order id but still map 1:1 to an intent.
create unique index if not exists payments_credit_intent_uidx
  on payments (stripe_payment_intent_id)
  where order_id is null and stripe_payment_intent_id is not null;

-- Replace redeem_credits with an idempotent version. The wallet row is locked
-- before the check, so concurrent retries cannot both insert a debit.
create or replace function redeem_credits(
  p_user_id uuid,
  p_amount integer,
  p_order_id uuid,
  p_payment_id uuid default null,
  p_reason text default 'Credit redemption at checkout'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  w_id uuid;
  tx_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Credit redemption amount must be positive';
  end if;
  select id into w_id from credit_wallets where user_id = p_user_id for update;
  if not found then raise exception 'Wallet not found for user'; end if;

  if p_order_id is not null then
    select id into tx_id from credit_transactions
      where related_order_id = p_order_id
        and transaction_type = 'purchase'
        and amount < 0
        and status = 'completed'
      limit 1;
    if found then return tx_id; end if;
  end if;

  insert into credit_transactions(
    wallet_id, user_id, amount, transaction_type, related_order_id,
    related_payment_id, reason, status
  ) values (
    w_id, p_user_id, -p_amount, 'purchase', p_order_id,
    p_payment_id, p_reason, 'completed'
  ) returning id into tx_id;
  return tx_id;
end $$;

revoke all on function redeem_credits(uuid, integer, uuid, uuid, text) from public, anon, authenticated;
grant execute on function redeem_credits(uuid, integer, uuid, uuid, text) to service_role;


-- ===== 0006_cloudflare_scan_queue.sql =====
-- Cloudflare Queues support: store the VirusTotal analysis id so background
-- queue consumers can poll without re-downloading the file from R2.
alter table public.product_files
  add column if not exists scan_analysis_id text;

create index if not exists product_files_scan_analysis_idx
  on public.product_files (scan_analysis_id)
  where scan_analysis_id is not null;

comment on column public.product_files.scan_analysis_id is
  'VirusTotal analysis id used by the Cloudflare Queue scan consumer.';


-- ===== API role grants =====
-- Supabase's newer secret keys still map to service_role, which needs explicit
-- table privileges on schemas created outside the dashboard defaults.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant select on all tables in schema public to authenticated;
grant select on public.categories, public.products, public.product_files to anon;

-- Refresh PostgREST's schema cache so the new tables are available over REST.
notify pgrst, 'reload schema';






-- ===== 0007_notifications.sql =====

-- In-app notifications. Notifications are generated by DB triggers so every
-- important state change produces one, regardless of which API route caused it.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('order', 'payment', 'credit', 'product', 'seller', 'report', 'account', 'system')),
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_self_read on public.notifications;
create policy notifications_self_read on public.notifications
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists notifications_self_update on public.notifications;
create policy notifications_self_update on public.notifications
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, update on public.notifications to authenticated;
-- The server API uses the service-role client and still needs table privileges.
grant select, update on public.notifications to service_role;

create or replace function public.notify_user(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user_id, p_type, p_title, p_body, p_link);
end;
$$;

-- Credits: wallet changes notify the owner.
create or replace function public.notify_credit_transaction() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_user(
    NEW.user_id,
    'credit',
    case when NEW.amount >= 0 then 'Credits added' else 'Credits deducted' end,
    format('%s credits · %s', abs(NEW.amount), coalesce(NEW.reason, 'Wallet updated')),
    '/buyer/credit-history'
  );
  return null;
end;
$$;

drop trigger if exists credit_transaction_notification on public.credit_transactions;
create trigger credit_transaction_notification
  after insert on public.credit_transactions
  for each row execute function public.notify_credit_transaction();

-- Products: moderation decisions notify the seller; new submissions notify admins.
create or replace function public.notify_product_status() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seller_user_id uuid;
  admin_row record;
  notification_title text;
begin
  if NEW.status is distinct from OLD.status then
    select user_id into seller_user_id from public.seller_profiles where id = NEW.seller_id;

    notification_title := case NEW.status
      when 'approved' then 'Product approved'
      when 'rejected' then 'Product needs changes'
      when 'pending_review' then 'Product submitted for review'
      when 'hidden' then 'Product hidden'
      when 'removed' then 'Product removed'
      else null
    end;

    if notification_title is not null then
      perform public.notify_user(
        seller_user_id,
        'product',
        notification_title,
        NEW.title || case
          when NEW.status = 'rejected' and NEW.rejection_reason is not null then ' · ' || NEW.rejection_reason
          else ''
        end,
        '/seller/products'
      );
    end if;

    if NEW.status = 'pending_review' then
      for admin_row in select id from public.users where role in ('admin', 'super_admin') loop
        perform public.notify_user(
          admin_row.id,
          'product',
          'Product awaiting review',
          NEW.title,
          '/admin/products'
        );
      end loop;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists product_status_notification on public.products;
create trigger product_status_notification
  after update of status on public.products
  for each row execute function public.notify_product_status();

-- Orders: paid orders notify the buyer and the selling account.
create or replace function public.notify_order_paid() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seller_user_id uuid;
begin
  if NEW.payment_status = 'paid' and OLD.payment_status is distinct from NEW.payment_status then
    perform public.notify_user(
      NEW.buyer_id,
      'order',
      'Purchase complete',
      'Order ' || NEW.order_number || ' is ready in your downloads.',
      '/buyer/purchases'
    );
    select user_id into seller_user_id from public.seller_profiles where id = NEW.seller_id;
    perform public.notify_user(
      seller_user_id,
      'payment',
      'New sale',
      'Order ' || NEW.order_number || ' earned ' || NEW.seller_earnings || ' credits.',
      '/seller/sales'
    );
  end if;
  return null;
end;
$$;

drop trigger if exists order_paid_notification on public.orders;
create trigger order_paid_notification
  after update of payment_status on public.orders
  for each row execute function public.notify_order_paid();

-- Reports: notify the reporter and admins on submission, and the reporter on resolution.
create or replace function public.notify_report_created() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_row record;
begin
  perform public.notify_user(
    NEW.reporter_id,
    'report',
    'Report submitted',
    'Thanks for reporting this product. Our team will review it.',
    '/buyer/purchases'
  );
  for admin_row in select id from public.users where role in ('admin', 'super_admin') loop
    perform public.notify_user(
      admin_row.id,
      'report',
      'New product report',
      NEW.reason || ': ' || left(NEW.details, 140),
      '/admin/reports'
    );
  end loop;
  return null;
end;
$$;

drop trigger if exists report_created_notification on public.product_reports;
create trigger report_created_notification
  after insert on public.product_reports
  for each row execute function public.notify_report_created();

create or replace function public.notify_report_status() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status is distinct from OLD.status and NEW.status in ('resolved', 'dismissed') then
    perform public.notify_user(
      NEW.reporter_id,
      'report',
      'Report updated',
      'Your report is now ' || NEW.status || '.',
      '/buyer/purchases'
    );
  end if;
  return null;
end;
$$;

drop trigger if exists report_status_notification on public.product_reports;
create trigger report_status_notification
  after update of status on public.product_reports
  for each row execute function public.notify_report_status();

-- Sellers: admins hear about new shops; sellers hear about verification/payout changes.
create or replace function public.notify_seller_created() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_row record;
begin
  for admin_row in select id from public.users where role in ('admin', 'super_admin') loop
    perform public.notify_user(
      admin_row.id,
      'seller',
      'New seller shop',
      NEW.store_name,
      '/admin/sellers'
    );
  end loop;
  return null;
end;
$$;

drop trigger if exists seller_created_notification on public.seller_profiles;
create trigger seller_created_notification
  after insert on public.seller_profiles
  for each row execute function public.notify_seller_created();

create or replace function public.notify_seller_status() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.verification_status is distinct from OLD.verification_status
     or NEW.payout_status is distinct from OLD.payout_status then
    perform public.notify_user(
      NEW.user_id,
      'seller',
      'Shop status updated',
      format('Verification: %s · Payout: %s', NEW.verification_status, NEW.payout_status),
      '/seller/settings'
    );
  end if;
  return null;
end;
$$;

drop trigger if exists seller_status_notification on public.seller_profiles;
create trigger seller_status_notification
  after update of verification_status, payout_status on public.seller_profiles
  for each row execute function public.notify_seller_status();

-- Account changes made by admins are visible to the affected user.
create or replace function public.notify_account_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status is distinct from OLD.status or NEW.role is distinct from OLD.role then
    perform public.notify_user(
      NEW.id,
      'account',
      'Account updated',
      format('Status: %s · Role: %s', NEW.status, NEW.role),
      '/buyer/settings'
    );
  end if;
  return null;
end;
$$;

drop trigger if exists account_change_notification on public.users;
create trigger account_change_notification
  after update of status, role on public.users
  for each row execute function public.notify_account_change();


-- ===== 0008_account_controls.sql =====

-- Account deletion and permission revocation controls.
-- Deletion is an account state, not a hard row delete:
-- financial, order, credit, and audit records must remain intact.

alter table public.users add column if not exists deleted_at timestamptz;

alter table public.users drop constraint if exists users_status_check;
alter table public.users add constraint users_status_check
  check (status in ('active', 'suspended', 'banned', 'deleted'));

create index if not exists users_status_deleted_at_idx
  on public.users (status, deleted_at desc);

-- Keep deleted accounts out of the default admin user lists unless requested.
-- (Application queries explicitly select the fields they need.)


-- ===== 0009_product_taxonomy.sql =====

-- Buyer-focused product taxonomy.
--
-- `file_format` stays the technical file extension (pdf, epub, zip, ...).
-- `content_type` answers a different question: what is the buyer getting and
-- how will they use it? Categories answer "what is this for?". Keeping these
-- separate makes ebooks, templates, courses and bundles distinguishable even
-- when they all arrive as a PDF or ZIP.

alter table public.products
  add column if not exists content_type text;

do $$
begin
  alter table public.products
    drop constraint if exists products_content_type_check;
  alter table public.products
    add constraint products_content_type_check
    check (
      content_type is null
      or content_type in (
        'ebook',
        'template',
        'planner_printable',
        'course_workshop',
        'creative_asset',
        'stock_media',
        'spreadsheet_tracker',
        'ai_prompt_pack',
        'bundle_starter_kit',
        'digital_tool',
        'document'
      )
    );
end $$;

create index if not exists products_content_type_idx on public.products (content_type);

-- Column privileges are cumulative with 0004. Re-grant the full public
-- allowlist here so the new column is explicitly readable and future internal
-- columns are not exposed by a table-wide grant.
revoke select on public.products from anon, authenticated;
grant select (
  id,
  seller_id,
  title,
  slug,
  description,
  short_description,
  category_id,
  content_type,
  tags,
  price,
  currency,
  status,
  preview_image_url,
  file_format,
  file_size,
  license_type,
  is_featured,
  view_count,
  created_at,
  approved_at
) on public.products to anon, authenticated;

-- Refresh the category taxonomy. Old format/tool-specific categories are
-- removed only when no product references them, so real catalog data is safe.
insert into public.categories (name, slug, description) values
  ('Templates & Productivity', 'templates-productivity', 'Reusable layouts and systems for work, study and everyday organization.'),
  ('Planners & Printables', 'planners-printables', 'Printable and digital planners, trackers, calendars and worksheets.'),
  ('Ebooks & Guides', 'ebooks-guides', 'Readable guides, reference books and step-by-step ebooks.'),
  ('Courses & Workshops', 'courses-workshops', 'Structured lessons and exercises that teach a specific skill.'),
  ('Creative Assets', 'creative-assets', 'Graphics, icons, mockups, fonts and elements for creative projects.'),
  ('Stock Media', 'stock-media', 'Ready-to-use photos, video clips, audio and other media files.'),
  ('Business & Finance Tools', 'business-finance-tools', 'Resources for budgets, invoices, clients, marketing and operations.'),
  ('AI & Tech Tools', 'ai-tech-tools', 'AI workflows, prompt systems and practical tech resources.'),
  ('Education & Teacher Resources', 'education-teacher-resources', 'Classroom materials, lesson plans and learning resources.'),
  ('Bundles & Starter Kits', 'bundles-starter-kits', 'Curated multi-product kits for getting started quickly.')
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description;

delete from public.categories c
where c.slug not in (
  'templates-productivity',
  'planners-printables',
  'ebooks-guides',
  'courses-workshops',
  'creative-assets',
  'stock-media',
  'business-finance-tools',
  'ai-tech-tools',
  'education-teacher-resources',
  'bundles-starter-kits'
)
and not exists (
  select 1 from public.products p where p.category_id = c.id
);


-- ===== 0010_workflow_fixes.sql =====

-- Workflow fixes.
--
-- 1. Product views are counted with an atomic, row-locked RPC so concurrent
--    page loads cannot lose increments to a read-modify-write race.
-- 2. Credit spends were recorded as transaction_type = 'purchase', the same
--    type used when a buyer buys credits. Add a dedicated 'spend' type without
--    invalidating any existing rows or weakening the per-order idempotency
--    guard. Product status constraints are intentionally untouched.

-- ---------------------------------------------------------------------------
-- Atomic public product view counter
-- ---------------------------------------------------------------------------
create or replace function public.increment_view_count(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_product_id is null then
    return;
  end if;

  -- Lock the product row before reading/writing the counter. Concurrent calls
  -- serialize here, so every approved page view is counted exactly once.
  perform 1 from public.products
    where id = p_product_id
      and status = 'approved'
    for update;
  if not found then
    -- Missing/unpublished products are not public page views. Callers treat
    -- this as a no-op so a view counter can never break the product page.
    return;
  end if;

  update public.products
     set view_count = coalesce(view_count, 0) + 1
   where id = p_product_id;
end;
$$;

revoke all on function public.increment_view_count(uuid) from public, anon, authenticated;
grant execute on function public.increment_view_count(uuid) to anon, authenticated, service_role;
comment on function public.increment_view_count(uuid) is
  'Atomically increment view_count for an approved product under a row lock.';

-- ---------------------------------------------------------------------------
-- Semantically correct credit spends
-- ---------------------------------------------------------------------------
-- Keep every previously allowed value so historical transactions remain
-- valid; only add 'spend' for credits redeemed at checkout.
do $$
begin
  alter table public.credit_transactions
    drop constraint if exists credit_transactions_transaction_type_check;
  alter table public.credit_transactions
    add constraint credit_transactions_transaction_type_check
    check (transaction_type in (
      'purchase', 'spend', 'refund', 'admin_grant', 'admin_deduction',
      'promotional_bonus', 'referral_bonus', 'reversal', 'expiry'
    ));
end $$;

-- Widen the 0005 idempotency guard to cover both legacy 'purchase' debits and
-- new 'spend' debits, so a retried webhook still cannot double-charge a wallet.
drop index if exists credit_tx_order_debit_uidx;
create unique index credit_tx_order_debit_uidx
  on public.credit_transactions (related_order_id)
  where related_order_id is not null
    and transaction_type in ('purchase', 'spend')
    and amount < 0
    and status = 'completed';

-- Replace redeem_credits with a version that writes 'spend'. It still detects
-- debits written by the old function before this migration was applied.
create or replace function redeem_credits(
  p_user_id uuid,
  p_amount integer,
  p_order_id uuid,
  p_payment_id uuid default null,
  p_reason text default 'Credit redemption at checkout'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  w_id uuid;
  tx_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Credit redemption amount must be positive';
  end if;
  select id into w_id from credit_wallets where user_id = p_user_id for update;
  if not found then raise exception 'Wallet not found for user'; end if;

  if p_order_id is not null then
    select id into tx_id from credit_transactions
      where related_order_id = p_order_id
        and transaction_type in ('purchase', 'spend')
        and amount < 0
        and status = 'completed'
      limit 1;
    if found then return tx_id; end if;
  end if;

  insert into credit_transactions(
    wallet_id, user_id, amount, transaction_type, related_order_id,
    related_payment_id, reason, status
  ) values (
    w_id, p_user_id, -p_amount, 'spend', p_order_id,
    p_payment_id, p_reason, 'completed'
  ) returning id into tx_id;
  return tx_id;
end $$;

revoke all on function redeem_credits(uuid, integer, uuid, uuid, text) from public, anon, authenticated;
grant execute on function redeem_credits(uuid, integer, uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';


-- ===== 0011_session_limits.sql =====
-- Concurrent sign-in device limit.
--
-- Supabase Auth stores one row per refresh-token session in auth.sessions.
-- These service-role-only RPCs let the app list, revoke and cap sessions
-- without exposing the auth schema to browser clients. Each successful login
-- keeps the new session plus the (limit - 1) most recently used sessions and
-- deletes the rest, so an account is signed in on at most 3 devices.

create or replace function public.list_user_sessions(p_user_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  refreshed_at timestamptz,
  user_agent text,
  ip text
)
language sql
security definer
set search_path = public, auth
as $$
  select
    s.id,
    s.created_at,
    s.updated_at,
    s.refreshed_at::timestamptz,
    s.user_agent,
    host(s.ip)::text
  from auth.sessions s
  where s.user_id = p_user_id
  order by coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) desc;
$$;

revoke all on function public.list_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.list_user_sessions(uuid) to service_role;

comment on function public.list_user_sessions(uuid) is
  'Service-role-only: list active Supabase Auth sessions for a user.';

create or replace function public.revoke_user_session(p_user_id uuid, p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_removed integer;
begin
  delete from auth.sessions
  where user_id = p_user_id and id = p_session_id;
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

revoke all on function public.revoke_user_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_session(uuid, uuid) to service_role;

comment on function public.revoke_user_session(uuid, uuid) is
  'Service-role-only: revoke one Supabase Auth session belonging to the given user.';

create or replace function public.enforce_user_session_limit(
  p_user_id uuid,
  p_limit integer default 3,
  p_current_session_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_keep integer;
  v_removed integer;
begin
  p_limit := greatest(1, least(coalesce(p_limit, 3), 10));

  if p_current_session_id is not null
     and exists (select 1 from auth.sessions where user_id = p_user_id and id = p_current_session_id) then
    v_keep := p_limit - 1;
  else
    v_keep := p_limit;
  end if;

  delete from auth.sessions s
  where s.user_id = p_user_id
    and (p_current_session_id is null or s.id <> p_current_session_id)
    and s.id in (
      select id
      from auth.sessions
      where user_id = p_user_id
        and (p_current_session_id is null or id <> p_current_session_id)
      order by coalesce(refreshed_at::timestamptz, updated_at, created_at) desc, id desc
      offset v_keep
    );
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

revoke all on function public.enforce_user_session_limit(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.enforce_user_session_limit(uuid, integer, uuid) to service_role;

comment on function public.enforce_user_session_limit(uuid, integer, uuid) is
  'Service-role-only: cap a user to p_limit active sessions, always keeping the current session.';

notify pgrst, 'reload schema';


-- ===== 0012_notification_coverage.sql =====
-- Notification coverage for payment, refund, dispute and admin activity events.
-- Existing triggers in 0007 cover orders, credits, products, reports, sellers
-- and user status/role changes. These triggers close the remaining gaps so the
-- bell reflects every important state change, not only a subset.

-- Guard every notification against orphaned targets: a deleted user must never
-- cause the source transaction (payment, refund, audit entry, ...) to fail.
create or replace function public.notify_user(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or not exists (select 1 from public.users where id = p_user_id) then
    return;
  end if;
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user_id, p_type, p_title, p_body, p_link);
end;
$$;

-- Fan out to active staff. The acting admin is excluded so their own action
-- does not create a redundant notification for themselves.
create or replace function public.notify_staff(
  p_type text,
  p_title text,
  p_body text,
  p_link text,
  p_exclude_user_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_row record;
begin
  for staff_row in
    select id from public.users
    where role in ('admin', 'super_admin')
      and status = 'active'
      and (p_exclude_user_id is null or id <> p_exclude_user_id)
  loop
    perform public.notify_user(staff_row.id, p_type, p_title, p_body, p_link);
  end loop;
end;
$$;

revoke all on function public.notify_staff(text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.notify_staff(text, text, text, text, uuid) to service_role;

comment on function public.notify_staff(text, text, text, text, uuid) is
  'Notify active admins/super admins about a staff-relevant event.';

-- Payments: card payments and credit-funded order payments both write a
-- payments row. Failed/refunded/disputed updates are visible to the payer.
create or replace function public.notify_payment_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_link text;
begin
  if NEW.status not in ('succeeded', 'failed', 'refunded', 'partially_refunded', 'disputed') then
    return null;
  end if;
  if TG_OP = 'UPDATE' and NEW.status is not distinct from OLD.status then
    return null;
  end if;

  v_title := case NEW.status
    when 'succeeded' then 'Payment received'
    when 'failed' then 'Payment failed'
    when 'refunded' then 'Payment refunded'
    when 'partially_refunded' then 'Payment partially refunded'
    when 'disputed' then 'Payment disputed'
  end;
  v_link := case when NEW.order_id is null then '/buyer/credits' else '/buyer/payments' end;

  perform public.notify_user(
    NEW.user_id,
    'payment',
    v_title,
    format('%s %s · %s', upper(NEW.currency), NEW.amount, coalesce(NEW.payment_method, 'payment')),
    v_link
  );
  return null;
end;
$$;

drop trigger if exists payment_notification on public.payments;
create trigger payment_notification
  after insert or update of status on public.payments
  for each row execute function public.notify_payment_change();

-- Refunds: the buyer sees the outcome; admins see the staff activity.
create or replace function public.notify_refund_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
  v_description text;
begin
  if TG_OP = 'UPDATE' and NEW.status is not distinct from OLD.status then
    return null;
  end if;

  select buyer_id into v_buyer_id from public.orders where id = NEW.order_id;
  v_description := format('%s credits · %s', NEW.amount, coalesce(NEW.reason, 'Refund'));

  if NEW.status = 'succeeded' then
    perform public.notify_user(
      v_buyer_id, 'payment', 'Refund processed', v_description, '/buyer/payments'
    );
    perform public.notify_staff(
      'payment', 'Refund recorded', v_description, '/admin/refunds', NEW.admin_id
    );
  elsif NEW.status = 'failed' then
    perform public.notify_user(
      v_buyer_id, 'payment', 'Refund failed', v_description, '/buyer/payments'
    );
  end if;
  return null;
end;
$$;

drop trigger if exists refund_notification on public.refunds;
create trigger refund_notification
  after insert or update of status on public.refunds
  for each row execute function public.notify_refund_change();

-- Disputes need an immediate buyer and staff alert.
create or replace function public.notify_dispute_created() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
begin
  select buyer_id into v_buyer_id from public.orders where id = NEW.order_id;
  perform public.notify_user(
    v_buyer_id, 'payment', 'Payment disputed',
    coalesce(NEW.reason, 'A dispute was opened on your order.'), '/buyer/payments'
  );
  perform public.notify_staff(
    'payment', 'New payment dispute',
    coalesce(NEW.reason, 'A buyer payment is under dispute.'), '/admin/refunds', null
  );
  return null;
end;
$$;

drop trigger if exists dispute_notification on public.disputes;
create trigger dispute_notification
  after insert on public.disputes
  for each row execute function public.notify_dispute_created();

-- Admin activity: notify other staff about sensitive actions. Routine
-- authentication and self-service events are excluded to avoid noise.
create or replace function public.notify_admin_activity() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link text;
  v_body text;
begin
  if NEW.actor_role not in ('admin', 'super_admin') then
    return null;
  end if;
  if NEW.action in (
    'auth.login', 'auth.logout', 'auth.session_revoked', 'auth.confirmation_resent'
  ) then
    return null;
  end if;

  v_link := case NEW.target_type
    when 'user' then '/admin/users'
    when 'product' then '/admin/products'
    when 'seller' then '/admin/sellers'
    when 'product_report' then '/admin/reports'
    when 'order' then '/admin/orders'
    when 'payment' then '/admin/refunds'
    when 'refund' then '/admin/refunds'
    when 'settings' then '/admin/settings'
    else '/admin/audit-logs'
  end;
  v_body := NEW.action || case
    when NEW.target_type is not null and NEW.target_id is not null
      then ' · ' || NEW.target_type || ' ' || left(NEW.target_id, 8)
    else ''
  end;

  perform public.notify_staff(
    'system', 'Admin activity', v_body, v_link, NEW.actor_id
  );

  -- Permissions can be revoked without changing role/status, so the users
  -- trigger in 0007 does not cover this case.
  if NEW.action = 'user.permissions_revoked'
     and NEW.target_type = 'user'
     and NEW.target_id is not null then
    begin
      perform public.notify_user(
        NEW.target_id::uuid, 'account', 'Account permissions updated',
        'An administrator changed what your account can access.', '/buyer/settings'
      );
    exception when invalid_text_representation then
      null;
    end;
  end if;
  return null;
end;
$$;

drop trigger if exists admin_activity_notification on public.audit_logs;
create trigger admin_activity_notification
  after insert on public.audit_logs
  for each row execute function public.notify_admin_activity();

notify pgrst, 'reload schema';

