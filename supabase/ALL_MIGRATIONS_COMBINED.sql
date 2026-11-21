-- The Digital Shelf - combined migrations (idempotent) 
-- Generated 2026-11-21 05:12

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
create index if not exists if not exists orders_intent_idx on orders(stripe_payment_intent_id);

-- 6. Indexes for the filters used by admin audit logs and coupon lookups.
create index if not exists if not exists audit_logs_action_idx on audit_logs(action, created_at desc);
create index if not exists if not exists coupons_code_trgm_idx on coupons using gin (upper(code) gin_trgm_ops);


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

create index if not exists if not exists product_files_scan_analysis_idx
  on public.product_files (scan_analysis_id)
  where scan_analysis_id is not null;

comment on column public.product_files.scan_analysis_id is
  'VirusTotal analysis id used by the Cloudflare Queue scan consumer.';





