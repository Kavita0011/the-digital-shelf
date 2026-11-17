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
