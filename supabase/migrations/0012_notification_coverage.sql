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
