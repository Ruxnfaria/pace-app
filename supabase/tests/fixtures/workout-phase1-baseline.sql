-- Disposable local test infrastructure only.
-- Never run this fixture against Supabase or any existing database.
-- It supplies only legacy objects that predate the migrations used by the
-- Workout Phase-1 ACL reconciliation integration test.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;

create table auth.users (
  id uuid primary key
);

create function auth.uid()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text,
  total_xp integer default 0,
  level integer default 1,
  streak integer default 0,
  last_activity_date date
);

alter table public.profiles enable row level security;

create table public.daily_missions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null,
  for_date date not null,
  completed boolean default false,
  xp_reward integer,
  current_value integer,
  target_value integer,
  completed_at timestamptz
);

alter table public.daily_missions enable row level security;

create table public.workouts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  exercises text not null,
  created_at timestamptz not null default now()
);

alter table public.workouts enable row level security;

create table public.workout_logs (
  id bigint generated always as identity primary key,
  user_id uuid,
  workout_id uuid,
  workout_date date
);

alter table public.workout_logs enable row level security;

-- This legacy compatibility function is absent from the repository's migration
-- history but is a required pre-existing dependency of the real Energy
-- remediation migration. The integration test never invokes it. Its body is
-- deliberately inert; only its reviewed signature, owner and pre-migration ACL
-- are relevant to that migration's preflight/postcondition contract.
create function public.toggle_mission_with_xp(
  p_mission_id uuid,
  p_completed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_mission_id is null or p_completed is null then
    raise exception 'Legacy toggle arguments are required';
  end if;
end;
$$;

revoke all on function public.toggle_mission_with_xp(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.toggle_mission_with_xp(uuid, boolean)
  to authenticated, service_role;
