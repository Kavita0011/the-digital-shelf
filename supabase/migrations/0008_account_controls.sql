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
