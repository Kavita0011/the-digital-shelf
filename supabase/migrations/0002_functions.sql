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
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Create a wallet for every user.
create or replace function handle_new_wallet() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.credit_wallets(user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_user_wallet_created on users;
create trigger on_user_wallet_created after insert on users
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
