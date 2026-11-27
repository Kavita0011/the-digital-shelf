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
