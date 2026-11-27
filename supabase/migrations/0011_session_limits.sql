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
