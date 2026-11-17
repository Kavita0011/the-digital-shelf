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
