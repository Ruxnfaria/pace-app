begin;

create table public.user_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_active_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_streaks_current_nonnegative
    check (current_streak >= 0),
  constraint user_streaks_longest_nonnegative
    check (longest_streak >= 0),
  constraint user_streaks_longest_not_shorter
    check (longest_streak >= current_streak),
  constraint user_streaks_empty_state_consistent check (
    (last_active_date is null and current_streak = 0)
    or (last_active_date is not null and current_streak > 0)
  )
);

create index user_streaks_last_active_date_idx
  on public.user_streaks (last_active_date)
  where last_active_date is not null;

create function public.user_streaks_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_streaks_set_updated_at
before update on public.user_streaks
for each row execute function public.user_streaks_set_updated_at();

create function public.record_user_streak_activity(p_user_id uuid)
returns table (
  user_id uuid,
  current_streak integer,
  effective_streak integer,
  longest_streak integer,
  last_active_date date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_current_streak integer;
  v_longest_streak integer;
  v_last_active_date date;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  insert into public.user_streaks (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select
    streak.current_streak,
    streak.longest_streak,
    streak.last_active_date
  into
    v_current_streak,
    v_longest_streak,
    v_last_active_date
  from public.user_streaks as streak
  where streak.user_id = p_user_id
  for update;

  if v_last_active_date is null then
    v_current_streak := 1;
  elsif v_last_active_date = v_today then
    null;
  elsif v_last_active_date = v_today - 1 then
    v_current_streak := v_current_streak + 1;
  elsif v_last_active_date < v_today - 1 then
    v_current_streak := 1;
  else
    raise exception 'last_active_date cannot be in the future';
  end if;

  v_longest_streak := greatest(v_longest_streak, v_current_streak);

  update public.user_streaks as streak
  set
    current_streak = v_current_streak,
    longest_streak = v_longest_streak,
    last_active_date = v_today
  where streak.user_id = p_user_id;

  return query
  select
    streak.user_id,
    streak.current_streak,
    streak.current_streak as effective_streak,
    streak.longest_streak,
    streak.last_active_date
  from public.user_streaks as streak
  where streak.user_id = p_user_id;
end;
$$;

create function public.get_my_streak()
returns table (
  user_id uuid,
  current_streak integer,
  effective_streak integer,
  longest_streak integer,
  last_active_date date
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    authenticated_user.user_id,
    coalesce(streak.current_streak, 0) as current_streak,
    case
      when streak.user_id is null then 0
      when streak.last_active_date >=
        (now() at time zone 'America/Sao_Paulo')::date - 1
        then streak.current_streak
      else 0
    end as effective_streak,
    coalesce(streak.longest_streak, 0) as longest_streak,
    streak.last_active_date
  from (select auth.uid() as user_id) as authenticated_user
  left join public.user_streaks as streak
    on streak.user_id = authenticated_user.user_id
  where authenticated_user.user_id is not null;
$$;

revoke execute on function public.user_streaks_set_updated_at()
  from public, anon, authenticated;
revoke execute on function public.record_user_streak_activity(uuid)
  from public, anon, authenticated;
revoke execute on function public.get_my_streak()
  from public, anon;

grant execute on function public.record_user_streak_activity(uuid)
  to service_role;
grant execute on function public.get_my_streak()
  to authenticated;

alter table public.user_streaks enable row level security;

create policy user_streaks_select_own
  on public.user_streaks for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_streaks from anon, authenticated;
grant select on table public.user_streaks to authenticated;

comment on function public.record_user_streak_activity(uuid) is
  'Server-only atomic streak registration using the current Brazil calendar date.';
comment on function public.get_my_streak() is
  'Returns the authenticated user streak with an effective value that expires only after a full missed Brazil day.';

commit;
