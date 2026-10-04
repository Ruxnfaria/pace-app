-- PRAXE gamification preflight. Read-only, one statement, one result set.
-- Run manually before applying any 20261003000xxx migration.
with proposed_tables(object_name) as (
  values
    ('user_wallets'::text),
    ('currency_transactions'::text),
    ('items'::text),
    ('user_inventory'::text),
    ('chest_definitions'::text),
    ('user_chests'::text),
    ('loot_tables'::text),
    ('loot_table_entries'::text),
    ('user_boosts'::text),
    ('reward_transactions'::text),
    ('user_streaks'::text)
),
table_collisions as (
  select array_agg(object_name order by object_name)::text[] as names
  from proposed_tables
  where to_regclass('public.' || object_name) is not null
),
function_collisions as (
  select array_remove(array[
    case when to_regprocedure('public.set_gamification_updated_at()') is not null
      then 'set_gamification_updated_at()' end,
    case when to_regprocedure('public.prevent_user_chest_reversion()') is not null
      then 'prevent_user_chest_reversion()' end,
    case when to_regprocedure('public.grant_user_chest(uuid,text,text,text,text)') is not null
      then 'grant_user_chest(uuid,text,text,text,text)' end,
    case when to_regprocedure('public.sync_user_mission_rewards(uuid,date)') is not null
      then 'sync_user_mission_rewards(uuid,date)' end,
    case when to_regprocedure('public.open_user_chest(uuid)') is not null
      then 'open_user_chest(uuid)' end,
    case when to_regprocedure('public.record_user_streak_activity(uuid)') is not null
      then 'record_user_streak_activity(uuid)' end,
    case when to_regprocedure('public.get_my_streak()') is not null
      then 'get_my_streak()' end,
    case when to_regprocedure(
      'public.upsert_current_daily_mission(uuid,date,text,text,text,integer,integer,integer)'
    ) is not null then
      'upsert_current_daily_mission(uuid,date,text,text,text,integer,integer,integer)'
    end
  ]::text[], null) as names
),
index_collisions as (
  select coalesce(array_agg(index_name order by index_name), array[]::text[]) as names
  from (
    values
      ('user_chests_reward_source_unique'::text),
      ('reward_transactions_source_reward_unique'::text),
      ('loot_table_entries_currency_reward_unique'::text),
      ('loot_table_entries_item_reward_unique'::text),
      ('daily_missions_current_category_unique'::text)
  ) as proposed(index_name)
  where to_regclass('public.' || index_name) is not null
),
trigger_policy_collisions as (
  select coalesce(array_agg(object_name order by object_name), array[]::text[]) as names
  from (
    select trigger_record.tgname::text as object_name
    from pg_catalog.pg_trigger as trigger_record
    where not trigger_record.tgisinternal
      and trigger_record.tgname::text in (
        'user_wallets_set_updated_at',
        'items_set_updated_at',
        'user_inventory_set_updated_at',
        'chest_definitions_set_updated_at',
        'loot_tables_set_updated_at',
        'loot_table_entries_set_updated_at',
        'user_boosts_set_updated_at',
        'user_chests_prevent_reversion',
        'user_streaks_set_updated_at'
      )
    union all
    select policy_record.polname::text
    from pg_catalog.pg_policy as policy_record
    where policy_record.polname::text in (
      'user_wallets_select_own',
      'currency_transactions_select_own',
      'user_inventory_select_own',
      'user_chests_select_own',
      'user_boosts_select_own',
      'reward_transactions_select_own',
      'items_select_active',
      'chest_definitions_select_active',
      'loot_tables_select_active',
      'loot_table_entries_select_active',
      'user_streaks_select_own'
    )
  ) as collisions
),
base_columns as (
  select
    count(*) filter (
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'total_xp'
        and data_type in ('smallint', 'integer', 'bigint')
    ) = 1 as total_xp_compatible,
    count(*) filter (
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'streak'
        and data_type in ('smallint', 'integer', 'bigint')
    ) = 1 as streak_compatible,
    count(*) filter (
      where table_schema = 'public'
        and table_name = 'daily_missions'
        and column_name in (
          'user_id',
          'for_date',
          'category',
          'completed',
          'title',
          'description',
          'target_value',
          'current_value',
          'xp_reward',
          'completed_at'
        )
    ) = 10 as daily_missions_compatible
  from information_schema.columns
),
base_rls as (
  select
    coalesce(bool_and(relation.relrowsecurity), false) as enabled
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname in ('profiles', 'daily_missions')
    and relation.relkind = 'r'
),
profile_data as (
  select
    count(*) filter (where profile.total_xp < 0)::bigint as negative_energy,
    count(*) filter (where profile.total_xp is null)::bigint as null_energy,
    count(*) filter (where profile.streak < 0)::bigint as negative_streak,
    count(*) filter (where profile.streak is null)::bigint as null_streak
  from public.profiles as profile
),
mission_data as (
  select
    count(*) filter (
      where grouped.row_count > 1
    )::bigint as duplicate_groups
  from (
    select
      mission.user_id,
      mission.for_date,
      mission.category,
      count(*) as row_count
    from public.daily_missions as mission
    where mission.category in ('workout', 'nutrition', 'protein')
    group by mission.user_id, mission.for_date, mission.category
  ) as grouped
),
mission_shape as (
  select
    count(*) filter (
      where mission.category in ('workout', 'nutrition', 'protein')
        and (
          mission.user_id is null
          or mission.for_date is null
          or mission.completed is null
        )
    )::bigint as incompatible_rows
  from public.daily_missions as mission
),
client_energy_write as (
  select exists (
    select 1
    from information_schema.column_privileges as privilege
    where privilege.table_schema = 'public'
      and privilege.table_name = 'profiles'
      and privilege.column_name = 'total_xp'
      and privilege.grantee in ('PUBLIC', 'anon', 'authenticated')
      and privilege.privilege_type in ('INSERT', 'UPDATE')
    union all
    select 1
    from information_schema.table_privileges as privilege
    where privilege.table_schema = 'public'
      and privilege.table_name = 'profiles'
      and privilege.grantee in ('PUBLIC', 'anon', 'authenticated')
      and privilege.privilege_type in ('INSERT', 'UPDATE')
  ) as enabled
),
checks(check_name, status, details) as (
  select
    'base_relations'::text,
    case
      when to_regclass('public.profiles') is null
        or to_regclass('public.daily_missions') is null
      then 'FAIL' else 'PASS'
    end,
    jsonb_build_object(
      'profiles', to_regclass('public.profiles') is not null,
      'daily_missions', to_regclass('public.daily_missions') is not null
    )
  union all
  select
    'base_columns',
    case
      when total_xp_compatible and streak_compatible and daily_missions_compatible
      then 'PASS' else 'FAIL'
    end,
    jsonb_build_object(
      'profiles_total_xp_integer', total_xp_compatible,
      'profiles_streak_integer', streak_compatible,
      'daily_missions_contract', daily_missions_compatible
    )
  from base_columns
  union all
  select
    'proposed_table_collisions',
    case when coalesce(cardinality(names), 0) = 0 then 'PASS' else 'FAIL' end,
    jsonb_build_object('collisions', coalesce(names, array[]::text[]))
  from table_collisions
  union all
  select
    'proposed_function_collisions',
    case when cardinality(names) = 0 then 'PASS' else 'FAIL' end,
    jsonb_build_object('collisions', names)
  from function_collisions
  union all
  select
    'proposed_index_collisions',
    case when cardinality(names) = 0 then 'PASS' else 'FAIL' end,
    jsonb_build_object('collisions', names)
  from index_collisions
  union all
  select
    'proposed_trigger_policy_collisions',
    case when cardinality(names) = 0 then 'PASS' else 'FAIL' end,
    jsonb_build_object('collisions', names)
  from trigger_policy_collisions
  union all
  select
    'base_rls',
    case when enabled then 'PASS' else 'FAIL' end,
    jsonb_build_object('profiles_and_daily_missions_rls_enabled', enabled)
  from base_rls
  union all
  select
    'profile_values',
    case
      when negative_energy > 0 or negative_streak > 0 then 'FAIL'
      when null_energy > 0 or null_streak > 0 then 'WARN'
      else 'PASS'
    end,
    jsonb_build_object(
      'negative_energy_rows', negative_energy,
      'null_energy_rows', null_energy,
      'negative_streak_rows', negative_streak,
      'null_streak_rows', null_streak
    )
  from profile_data
  union all
  select
    'current_mission_duplicates',
    case when duplicate_groups = 0 then 'PASS' else 'FAIL' end,
    jsonb_build_object('duplicate_groups', duplicate_groups)
  from mission_data
  union all
  select
    'current_mission_shape',
    case when incompatible_rows = 0 then 'PASS' else 'FAIL' end,
    jsonb_build_object('incompatible_rows', incompatible_rows)
  from mission_shape
  union all
  select
    'profiles_energy_client_write',
    case when enabled then 'FAIL' else 'PASS' end,
    jsonb_build_object('client_roles_can_write_total_xp', enabled)
  from client_energy_write
  union all
  select
    'required_platform_functions',
    case
      when to_regprocedure('gen_random_uuid()') is not null
        and to_regprocedure('auth.uid()') is not null
      then 'PASS' else 'FAIL'
    end,
    jsonb_build_object(
      'gen_random_uuid', to_regprocedure('gen_random_uuid()') is not null,
      'auth_uid', to_regprocedure('auth.uid()') is not null
    )
),
summary as (
  select
    case
      when count(*) filter (where status = 'FAIL') > 0 then 'FAIL'
      when count(*) filter (where status = 'WARN') > 0 then 'WARN'
      else 'PASS'
    end as overall_status,
    count(*) filter (where status = 'PASS')::integer as pass_count,
    count(*) filter (where status = 'WARN')::integer as warn_count,
    count(*) filter (where status = 'FAIL')::integer as fail_count,
    jsonb_agg(
      jsonb_build_object(
        'check', check_name,
        'status', status,
        'details', details
      )
      order by check_name
    ) as checks
  from checks
)
select
  overall_status,
  pass_count,
  warn_count,
  fail_count,
  checks
from summary;
