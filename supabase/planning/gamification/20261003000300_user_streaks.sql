begin;

create table public.user_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= current_streak),
  last_active_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_streaks_activity_shape_check check (
    (current_streak = 0 and last_active_date is null)
    or (current_streak > 0 and last_active_date is not null)
  )
);

create trigger user_streaks_set_updated_at
before update on public.user_streaks
for each row execute function public.set_gamification_updated_at();

alter table public.user_streaks enable row level security;

create policy user_streaks_select_own on public.user_streaks
for select to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.user_streaks from public, anon, authenticated;
grant select on table public.user_streaks to authenticated;
grant all on table public.user_streaks to service_role;

create function public.record_user_streak_activity(p_user_id uuid)
returns table (
  user_id uuid,
  current_streak integer,
  longest_streak integer,
  last_active_date date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_legacy_streak integer;
  v_current_streak integer;
  v_longest_streak integer;
  v_last_active_date date;
begin
  if p_user_id is null then
    raise exception using errcode = '22004', message = 'User id is required';
  end if;

  select greatest(coalesce(profile.streak, 0), 0)
  into v_legacy_streak
  from public.profiles as profile
  where profile.user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  select
    streak.current_streak,
    streak.longest_streak,
    streak.last_active_date
  into v_current_streak, v_longest_streak, v_last_active_date
  from public.user_streaks as streak
  where streak.user_id = p_user_id
  for update;

  if not found then
    v_current_streak := greatest(v_legacy_streak, 1);
    v_longest_streak := v_current_streak;
    v_last_active_date := v_today;

    insert into public.user_streaks (
      user_id,
      current_streak,
      longest_streak,
      last_active_date
    )
    values (
      p_user_id,
      v_current_streak,
      v_longest_streak,
      v_last_active_date
    );
  elsif v_last_active_date = v_today then
    null;
  elsif v_last_active_date = v_today - 1 then
    v_current_streak := v_current_streak + 1;
    v_longest_streak := greatest(v_longest_streak, v_current_streak);
    v_last_active_date := v_today;

    update public.user_streaks as streak
    set
      current_streak = v_current_streak,
      longest_streak = v_longest_streak,
      last_active_date = v_last_active_date
    where streak.user_id = p_user_id;
  else
    v_current_streak := 1;
    v_longest_streak := greatest(v_longest_streak, 1);
    v_last_active_date := v_today;

    update public.user_streaks as streak
    set
      current_streak = v_current_streak,
      longest_streak = v_longest_streak,
      last_active_date = v_last_active_date
    where streak.user_id = p_user_id;
  end if;

  update public.profiles as profile
  set streak = v_current_streak
  where profile.user_id = p_user_id
    and profile.streak is distinct from v_current_streak;

  return query select
    p_user_id,
    v_current_streak,
    v_longest_streak,
    v_last_active_date;
end;
$$;

create function public.get_my_streak()
returns table (
  user_id uuid,
  current_streak integer,
  longest_streak integer,
  last_active_date date,
  source text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    profile.user_id,
    coalesce(streak.current_streak, greatest(coalesce(profile.streak, 0), 0)),
    coalesce(streak.longest_streak, greatest(coalesce(profile.streak, 0), 0)),
    streak.last_active_date,
    case when streak.user_id is null then 'profiles_legacy' else 'user_streaks' end
  from public.profiles as profile
  left join public.user_streaks as streak
    on streak.user_id = profile.user_id
  where profile.user_id = auth.uid()
$$;

revoke all on function public.record_user_streak_activity(uuid)
from public, anon, authenticated;
grant execute on function public.record_user_streak_activity(uuid) to service_role;

revoke all on function public.get_my_streak() from public, anon;
grant execute on function public.get_my_streak() to authenticated;

commit;
