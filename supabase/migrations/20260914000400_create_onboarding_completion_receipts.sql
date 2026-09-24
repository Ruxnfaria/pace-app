-- Preparation only: manual review required before applying.
-- Success receipts only; future completion RPC must persist them atomically.
begin;

set local lock_timeout = '5s';

do $preflight$
declare
  users_oid oid;
  users_id_attnum smallint;
begin
  if pg_catalog.to_regclass('public.onboarding_completion_receipts') is not null then
    raise exception 'Relation public.onboarding_completion_receipts already exists; audit before proceeding';
  end if;

  users_oid := pg_catalog.to_regclass('auth.users');
  if users_oid is null or not exists (
    select 1 from pg_catalog.pg_class
    where oid = users_oid and relkind in ('r', 'p')
  ) then
    raise exception 'Required parent table auth.users is missing or incompatible';
  end if;

  select a.attnum into users_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = users_oid and a.attname = 'id'
    and a.attnum > 0 and not a.attisdropped
    and a.atttypid = 'pg_catalog.uuid'::regtype and a.attnotnull;

  if users_id_attnum is null then
    raise exception 'auth.users.id must exist as uuid NOT NULL';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_index i
    where i.indrelid = users_oid
      and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
      and i.indpred is null and i.indexprs is null
      and i.indnkeyatts = 1 and i.indkey[0] = users_id_attnum
  ) then
    raise exception 'auth.users.id requires a valid non-partial immediate UNIQUE key suitable for a foreign key';
  end if;
end
$preflight$;

create table public.onboarding_completion_receipts (
  user_id uuid not null,
  onboarding_version smallint not null,
  idempotency_key uuid not null,
  payload_hash bytea not null,
  payload_schema_version smallint not null,
  canonicalization_version smallint not null,
  completed_at timestamptz not null default now(),

  constraint onboarding_completion_receipts_pkey
    primary key (user_id, onboarding_version),
  constraint onboarding_completion_receipts_user_key_unique
    unique (user_id, idempotency_key),
  constraint onboarding_completion_receipts_user_fk foreign key (user_id)
    references auth.users(id) on delete cascade,
  constraint onboarding_completion_receipts_version_positive check (
    onboarding_version > 0
  ),
  constraint onboarding_completion_receipts_payload_schema_positive check (
    payload_schema_version > 0
  ),
  constraint onboarding_completion_receipts_canonicalization_positive check (
    canonicalization_version > 0
  ),
  constraint onboarding_completion_receipts_hash_length_check check (
    octet_length(payload_hash) = 32
  )
);

alter table public.onboarding_completion_receipts enable row level security;

create policy onboarding_completion_receipts_select_own
  on public.onboarding_completion_receipts for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.onboarding_completion_receipts from public, anon, authenticated;

grant select on table public.onboarding_completion_receipts to authenticated;

-- Administrative access remains available; clients cannot mutate receipts.
grant select, insert, update, delete
  on public.onboarding_completion_receipts to service_role;

commit;
