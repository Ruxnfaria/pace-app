-- Preparation only. Do not execute or apply without manual review.
-- Entirely additive: no legacy data, profiles, workouts, or rewards are changed.
-- Activities and their days are represented by child rows, never parallel lists.
begin;

set local lock_timeout = '5s';

do $preflight$
begin
  if pg_catalog.to_regclass('public.training_profiles') is not null
     or pg_catalog.to_regclass('public.training_profile_activities') is not null then
    raise exception 'Training profile tables already exist; audit before proceeding';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'reward_system_set_updated_at'
      and p.pronargs = 0
      and p.prorettype = 'pg_catalog.trigger'::regtype
  ) then
    raise exception 'Required existing updated_at trigger function is missing';
  end if;
end
$preflight$;

-- Pure validation helper: one-dimensional, canonical, non-null, unique entries.
-- Empty arrays are valid sets; individual column checks decide minimum sizes.
create function public.training_profile_code_set_valid(
  p_values text[],
  p_allowed text[]
)
returns boolean
language sql
immutable
strict
parallel safe
set search_path = ''
as $function$
  select coalesce(pg_catalog.array_ndims(p_values), 1) = 1
     and coalesce(pg_catalog.array_lower(p_values, 1), 1) = 1
     and p_values <@ p_allowed
     and pg_catalog.cardinality(p_values) = (
       select count(distinct v.entry)
       from pg_catalog.unnest(p_values) as v(entry)
     );
$function$;

create table public.training_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  primary_goal text not null,
  priority_muscles text[] not null,
  training_experience text not null,
  exercise_confidence text not null,
  recent_training_break text,
  initial_training_level text not null,
  training_days_per_week smallint not null,
  available_weekdays smallint[] not null,
  session_duration_min smallint not null,
  session_duration_is_plus boolean not null,
  training_location text not null,
  other_location_label varchar(80),
  available_equipment text[] not null,
  other_equipment_label varchar(80),
  pain_or_limitation boolean not null,
  affected_body_areas text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint training_profiles_user_unique unique (user_id),
  constraint training_profiles_user_fk foreign key (user_id)
    references auth.users(id) on delete cascade,
  constraint training_profiles_goal_check check (
    primary_goal in (
      'hypertrophy', 'fat_loss', 'body_recomposition',
      'strength', 'conditioning', 'health'
    )
  ),
  constraint training_profiles_priorities_check check (
    cardinality(priority_muscles) <= 3
    and public.training_profile_code_set_valid(priority_muscles, array[
      'chest', 'back', 'shoulders', 'biceps', 'triceps',
      'quadriceps', 'hamstrings', 'glutes', 'calves', 'core'
    ]::text[])
  ),
  constraint training_profiles_experience_check check (
    training_experience in (
      'none', 'under_6_months', '6_to_12_months',
      '1_to_2_years', 'over_2_years'
    )
  ),
  constraint training_profiles_confidence_check check (
    exercise_confidence in (
      'needs_guidance', 'basic_independent', 'confident_independent'
    )
  ),
  constraint training_profiles_break_check check (
    (training_experience = 'none' and recent_training_break is null)
    or (
      training_experience <> 'none'
      and recent_training_break is not null
      and recent_training_break in (
        'no_significant_break', 'under_1_month',
        '1_to_3_months', 'over_3_months'
      )
    )
  ),
  constraint training_profiles_initial_level_check check (
    initial_training_level in ('beginner', 'intermediate', 'advanced')
  ),
  constraint training_profiles_frequency_check check (
    training_days_per_week between 2 and 6
  ),
  constraint training_profiles_weekdays_check check (
    public.training_profile_code_set_valid(
      available_weekdays::text[], array['1', '2', '3', '4', '5', '6', '7']::text[]
    )
    and cardinality(available_weekdays) >= training_days_per_week
  ),
  constraint training_profiles_duration_check check (
    (session_duration_min in (30, 45, 60, 75) and not session_duration_is_plus)
    or (session_duration_min = 90 and session_duration_is_plus)
  ),
  constraint training_profiles_location_check check (
    training_location in ('full_gym', 'home', 'outdoor', 'other')
  ),
  constraint training_profiles_other_location_check check (
    (training_location = 'other'
      and other_location_label is not null
      and btrim(other_location_label) <> '')
    or (training_location <> 'other' and other_location_label is null)
  ),
  constraint training_profiles_equipment_check check (
    cardinality(available_equipment) >= 1
    and public.training_profile_code_set_valid(available_equipment, array[
      'bodyweight', 'dumbbells', 'barbell', 'weight_plates', 'bench', 'rack',
      'cable_machine', 'selectorized_machines', 'smith_machine', 'leg_press',
      'resistance_bands', 'pull_up_bar', 'kettlebell', 'other'
    ]::text[])
  ),
  constraint training_profiles_other_equipment_check check (
    ('other' = any(available_equipment)
      and other_equipment_label is not null
      and btrim(other_equipment_label) <> '')
    or (not ('other' = any(available_equipment)) and other_equipment_label is null)
  ),
  constraint training_profiles_body_areas_check check (
    public.training_profile_code_set_valid(affected_body_areas, array[
      'neck', 'shoulder', 'elbow', 'wrist_hand', 'upper_back', 'lower_back',
      'hip', 'knee', 'ankle_foot', 'other', 'unspecified'
    ]::text[])
    and (
      (not pain_or_limitation and cardinality(affected_body_areas) = 0)
      or (pain_or_limitation and cardinality(affected_body_areas) >= 1)
    )
  )
);

-- Initial classification is deterministic, insert-only, and unrelated to XP.
-- Later edits do not overwrite the first classification. Future progression
-- requires its own assessments/history and is intentionally not implemented.
create function public.training_profiles_set_initial_level()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.initial_training_level := case
    when new.training_experience in ('none', 'under_6_months')
      or new.exercise_confidence = 'needs_guidance'
      or new.recent_training_break = 'over_3_months'
      then 'beginner'
    when new.training_experience = 'over_2_years'
      and new.exercise_confidence = 'confident_independent'
      and new.recent_training_break in ('no_significant_break', 'under_1_month')
      then 'advanced'
    else 'intermediate'
  end;
  return new;
end;
$function$;

create trigger training_profiles_set_initial_level
before insert on public.training_profiles
for each row execute function public.training_profiles_set_initial_level();

create trigger training_profiles_set_updated_at
before update on public.training_profiles
for each row execute function public.reward_system_set_updated_at();

-- Each activity owns its schedule. No other_activities/activity_days duplication.
-- No rows means no additional activity for a completed training profile.
create table public.training_profile_activities (
  user_id uuid not null,
  activity_code text not null,
  other_activity_label varchar(80),
  schedule_type text not null,
  available_weekdays smallint[],
  sessions_per_week smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint training_profile_activities_pk primary key (user_id, activity_code),
  constraint training_profile_activities_user_fk foreign key (user_id)
    references public.training_profiles(user_id) on delete cascade,
  constraint training_profile_activities_code_check check (
    activity_code in (
      'running', 'football', 'cycling', 'combat_sports', 'swimming', 'other'
    )
  ),
  constraint training_profile_activities_other_check check (
    (activity_code = 'other'
      and other_activity_label is not null
      and btrim(other_activity_label) <> '')
    or (activity_code <> 'other' and other_activity_label is null)
  ),
  constraint training_profile_activities_schedule_check check (
    (
      schedule_type = 'fixed_weekdays'
      and available_weekdays is not null
      and cardinality(available_weekdays) >= 1
      and public.training_profile_code_set_valid(
        available_weekdays::text[], array['1', '2', '3', '4', '5', '6', '7']::text[]
      )
      and sessions_per_week is null
    )
    or (
      schedule_type = 'variable'
      and available_weekdays is null
      and sessions_per_week is not null
      and sessions_per_week > 0
    )
  )
);

create trigger training_profile_activities_set_updated_at
before update on public.training_profile_activities
for each row execute function public.reward_system_set_updated_at();

alter table public.training_profiles enable row level security;
alter table public.training_profile_activities enable row level security;

create policy training_profiles_select_own
  on public.training_profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy training_profiles_insert_own
  on public.training_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy training_profiles_update_own
  on public.training_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy training_profile_activities_select_own
  on public.training_profile_activities for select to authenticated
  using ((select auth.uid()) = user_id);
create policy training_profile_activities_insert_own
  on public.training_profile_activities for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy training_profile_activities_update_own
  on public.training_profile_activities for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Remove default PUBLIC/client table access; grant intended user operations.
-- Users cannot supply initial level, identities, ownership changes, or timestamps.
revoke all on table public.training_profiles from public, anon, authenticated;
revoke all on table public.training_profile_activities from public, anon, authenticated;

grant select on table public.training_profiles to authenticated;
grant insert (
  user_id, primary_goal, priority_muscles, training_experience, exercise_confidence,
  recent_training_break, training_days_per_week, available_weekdays,
  session_duration_min, session_duration_is_plus, training_location,
  other_location_label, available_equipment, other_equipment_label,
  pain_or_limitation, affected_body_areas
) on public.training_profiles to authenticated;
grant update (
  primary_goal, priority_muscles, training_experience, exercise_confidence,
  recent_training_break, training_days_per_week, available_weekdays,
  session_duration_min, session_duration_is_plus, training_location,
  other_location_label, available_equipment, other_equipment_label,
  pain_or_limitation, affected_body_areas
) on public.training_profiles to authenticated;

grant select on table public.training_profile_activities to authenticated;
grant insert (
  user_id, activity_code, other_activity_label, schedule_type,
  available_weekdays, sessions_per_week
) on public.training_profile_activities to authenticated;
grant update (
  other_activity_label, schedule_type, available_weekdays, sessions_per_week
) on public.training_profile_activities to authenticated;

revoke execute on function public.training_profile_code_set_valid(text[], text[])
  from public, anon, authenticated;
grant execute on function public.training_profile_code_set_valid(text[], text[])
  to authenticated;
revoke execute on function public.training_profiles_set_initial_level()
  from public, anon, authenticated;

commit;
