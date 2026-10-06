-- Catalog-only post-apply audit for PRAXE workout persistence.
-- One read-only statement, one consolidated result set, no RPC invocation and
-- no user-row reads.
with
expected_tables(table_name) as (
  values
    ('workout_sessions'::text),
    ('workout_session_exercises'),
    ('workout_session_legacy_log'),
    ('workout_weekly_schedule'),
    ('workout_schedule_occurrences'),
    ('workout_schedule_occurrence_exercises')
),
expected_columns(table_name, column_name, formatted_type, not_null) as (
  values
    ('workout_sessions'::text, 'id'::text, 'uuid'::text, true),
    ('workout_sessions', 'user_id', 'uuid', true),
    ('workout_sessions', 'workout_id', 'uuid', false),
    ('workout_sessions', 'schedule_occurrence_id', 'uuid', false),
    ('workout_sessions', 'workout_title', 'character varying(160)', true),
    ('workout_sessions', 'status', 'text', true),
    ('workout_sessions', 'scheduled_for_date', 'date', false),
    ('workout_sessions', 'started_at', 'timestamp with time zone', true),
    ('workout_sessions', 'completed_at', 'timestamp with time zone', false),
    ('workout_sessions', 'note', 'text', false),
    ('workout_sessions', 'client_request_id', 'uuid', true),
    ('workout_sessions', 'created_at', 'timestamp with time zone', true),
    ('workout_sessions', 'updated_at', 'timestamp with time zone', true),
    ('workout_session_exercises', 'id', 'uuid', true),
    ('workout_session_exercises', 'session_id', 'uuid', true),
    ('workout_session_exercises', 'exercise_key', 'character varying(160)', false),
    ('workout_session_exercises', 'name', 'character varying(160)', true),
    ('workout_session_exercises', 'exercise_position', 'smallint', true),
    ('workout_session_exercises', 'sets', 'character varying(40)', true),
    ('workout_session_exercises', 'reps', 'character varying(80)', true),
    ('workout_session_exercises', 'rest', 'character varying(80)', false),
    ('workout_session_exercises', 'tip_snapshot', 'character varying(500)', false),
    ('workout_session_exercises', 'completed_at', 'timestamp with time zone', false),
    ('workout_session_exercises', 'created_at', 'timestamp with time zone', true),
    ('workout_session_legacy_log', 'session_id', 'uuid', true),
    ('workout_session_legacy_log', 'workout_log_id', 'bigint', true),
    ('workout_session_legacy_log', 'created_at', 'timestamp with time zone', true),
    ('workout_weekly_schedule', 'user_id', 'uuid', true),
    ('workout_weekly_schedule', 'iso_weekday', 'smallint', true),
    ('workout_weekly_schedule', 'original_workout_id', 'uuid', false),
    ('workout_weekly_schedule', 'workout_id', 'uuid', false),
    ('workout_weekly_schedule', 'effective_from_date', 'date', true),
    ('workout_weekly_schedule', 'materialized_through_date', 'date', true),
    ('workout_weekly_schedule', 'created_at', 'timestamp with time zone', true),
    ('workout_weekly_schedule', 'updated_at', 'timestamp with time zone', true),
    ('workout_schedule_occurrences', 'id', 'uuid', true),
    ('workout_schedule_occurrences', 'user_id', 'uuid', true),
    ('workout_schedule_occurrences', 'scheduled_for_date', 'date', true),
    ('workout_schedule_occurrences', 'source_workout_id', 'uuid', false),
    ('workout_schedule_occurrences', 'workout_title_snapshot', 'character varying(160)', true),
    ('workout_schedule_occurrences', 'skipped_at', 'timestamp with time zone', false),
    ('workout_schedule_occurrences', 'skip_reason', 'character varying(240)', false),
    ('workout_schedule_occurrences', 'created_at', 'timestamp with time zone', true),
    ('workout_schedule_occurrence_exercises', 'id', 'uuid', true),
    ('workout_schedule_occurrence_exercises', 'occurrence_id', 'uuid', true),
    ('workout_schedule_occurrence_exercises', 'exercise_key', 'character varying(160)', false),
    ('workout_schedule_occurrence_exercises', 'name', 'character varying(160)', true),
    ('workout_schedule_occurrence_exercises', 'exercise_position', 'smallint', true),
    ('workout_schedule_occurrence_exercises', 'sets', 'character varying(40)', true),
    ('workout_schedule_occurrence_exercises', 'reps', 'character varying(80)', true),
    ('workout_schedule_occurrence_exercises', 'rest', 'character varying(80)', false),
    ('workout_schedule_occurrence_exercises', 'tip_snapshot', 'character varying(500)', false),
    ('workout_schedule_occurrence_exercises', 'created_at', 'timestamp with time zone', true)
),
actual_columns as (
  select c.relname::text as table_name, a.attname::text as column_name,
         pg_catalog.format_type(a.atttypid, a.atttypmod)::text as formatted_type,
         a.attnotnull as not_null
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join expected_tables e on e.table_name = c.relname
  where n.nspname = 'public' and c.relkind = 'r'
    and a.attnum > 0 and not a.attisdropped
),
column_delta as (
  (select * from expected_columns except select * from actual_columns)
  union all
  (select * from actual_columns except select * from expected_columns)
),
expected_constraints(
  constraint_name, constraint_type, local_columns,
  referenced_relation, referenced_columns, delete_action
) as (
  values
    ('workout_sessions_pkey'::text, 'p'::text, array['id']::text[], null::text, null::text[], null::text),
    ('workout_sessions_user_request_unique', 'u', array['user_id','client_request_id'], null, null, null),
    ('workout_sessions_user_id_fkey', 'f', array['user_id'], 'auth.users', array['id'], 'c'),
    ('workout_sessions_workout_id_fkey', 'f', array['workout_id'], 'public.workouts', array['id'], 'n'),
    ('workout_sessions_occurrence_fk', 'f', array['schedule_occurrence_id'], 'public.workout_schedule_occurrences', array['id'], 'r'),
    ('workout_session_exercises_pkey', 'p', array['id'], null, null, null),
    ('workout_session_exercises_exercise_position_unique', 'u', array['session_id','exercise_position'], null, null, null),
    ('workout_session_exercises_session_id_fkey', 'f', array['session_id'], 'public.workout_sessions', array['id'], 'c'),
    ('workout_session_legacy_log_pkey', 'p', array['session_id'], null, null, null),
    ('workout_session_legacy_log_workout_log_id_key', 'u', array['workout_log_id'], null, null, null),
    ('workout_session_legacy_log_session_id_fkey', 'f', array['session_id'], 'public.workout_sessions', array['id'], 'c'),
    ('workout_session_legacy_log_workout_log_id_fkey', 'f', array['workout_log_id'], 'public.workout_logs', array['id'], 'r'),
    ('workout_weekly_schedule_pk', 'p', array['user_id','iso_weekday'], null, null, null),
    ('workout_weekly_schedule_user_id_fkey', 'f', array['user_id'], 'auth.users', array['id'], 'c'),
    ('workout_weekly_schedule_original_workout_id_fkey', 'f', array['original_workout_id'], 'public.workouts', array['id'], 'r'),
    ('workout_weekly_schedule_workout_id_fkey', 'f', array['workout_id'], 'public.workouts', array['id'], 'r'),
    ('workout_schedule_occurrences_pkey', 'p', array['id'], null, null, null),
    ('workout_schedule_occurrences_user_date_unique', 'u', array['user_id','scheduled_for_date'], null, null, null),
    ('workout_schedule_occurrences_user_id_fkey', 'f', array['user_id'], 'auth.users', array['id'], 'c'),
    ('workout_schedule_occurrences_source_workout_id_fkey', 'f', array['source_workout_id'], 'public.workouts', array['id'], 'n'),
    ('workout_schedule_occurrence_exercises_pkey', 'p', array['id'], null, null, null),
    ('workout_occurrence_exercises_exercise_position_unique', 'u', array['occurrence_id','exercise_position'], null, null, null),
    ('workout_schedule_occurrence_exercises_occurrence_id_fkey', 'f', array['occurrence_id'], 'public.workout_schedule_occurrences', array['id'], 'c')
),
actual_constraints as (
  select c.conname::text as constraint_name, c.contype::text as constraint_type,
         (select pg_catalog.array_agg(a.attname::text order by k.ordinality)
          from pg_catalog.unnest(c.conkey) with ordinality k(attnum, ordinality)
          join pg_catalog.pg_attribute a
            on a.attrelid = c.conrelid and a.attnum = k.attnum) as local_columns,
         case when c.contype = 'f'
           then nr.nspname::text || '.' || rr.relname::text else null::text end
           as referenced_relation,
         case when c.contype = 'f' then
           (select pg_catalog.array_agg(a.attname::text order by k.ordinality)
            from pg_catalog.unnest(c.confkey) with ordinality k(attnum, ordinality)
            join pg_catalog.pg_attribute a
              on a.attrelid = c.confrelid and a.attnum = k.attnum)
           else null::text[] end as referenced_columns,
         case when c.contype = 'f' then c.confdeltype::text else null::text end as delete_action
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class r on r.oid = c.conrelid
  join pg_catalog.pg_namespace n on n.oid = r.relnamespace
  left join pg_catalog.pg_class rr on rr.oid = c.confrelid
  left join pg_catalog.pg_namespace nr on nr.oid = rr.relnamespace
  join expected_tables e on e.table_name = r.relname
  where n.nspname = 'public' and c.contype in ('p', 'u', 'f')
),
constraint_delta as (
  (select * from expected_constraints except select * from actual_constraints)
  union all
  (select * from actual_constraints except select * from expected_constraints)
),
expected_indexes(index_name, is_unique, index_columns, is_partial) as (
  values
    ('workout_sessions_user_status_started_idx'::text, false, array['user_id','status','started_at']::text[], false),
    ('workout_sessions_user_workout_completed_idx', false, array['user_id','workout_id','completed_at'], true),
    ('workout_sessions_completed_occurrence_unique', true, array['schedule_occurrence_id'], true),
    ('workout_sessions_live_occurrence_unique', true, array['schedule_occurrence_id'], true),
    ('workout_schedule_occurrences_pending_idx', false, array['user_id','scheduled_for_date','id'], true),
    ('workout_weekly_schedule_current_workout_idx', false, array['workout_id'], true),
    ('workout_weekly_schedule_original_workout_idx', false, array['original_workout_id'], true)
),
actual_indexes as (
  select ci.relname::text as index_name, i.indisunique as is_unique,
         (select pg_catalog.array_agg(a.attname::text order by k.ordinality)
          from pg_catalog.unnest(i.indkey) with ordinality k(attnum, ordinality)
          join pg_catalog.pg_attribute a
            on a.attrelid = i.indrelid and a.attnum = k.attnum
          where k.attnum > 0) as index_columns,
         i.indpred is not null as is_partial
  from pg_catalog.pg_index i
  join pg_catalog.pg_class ci on ci.oid = i.indexrelid
  join pg_catalog.pg_class ct on ct.oid = i.indrelid
  join pg_catalog.pg_namespace n on n.oid = ct.relnamespace
  where n.nspname = 'public'
    and ci.relname in (select e.index_name from expected_indexes e)
),
expected_triggers(trigger_name) as (
  values
    ('workout_sessions_guard_update'::text),
    ('workout_sessions_set_updated_at'),
    ('workout_session_exercises_guard_update'),
    ('workout_session_legacy_log_reject_update'),
    ('workout_weekly_schedule_set_updated_at'),
    ('workout_occurrences_guard_update'),
    ('workout_occurrence_exercises_reject_update')
),
expected_policies(policy_name, table_name, command, roles) as (
  values
    ('workout_sessions_select_own'::text, 'workout_sessions'::text, 'r'::text,
      array[pg_catalog.to_regrole('authenticated')::oid]),
    ('workout_session_exercises_select_own', 'workout_session_exercises', 'r',
      array[pg_catalog.to_regrole('authenticated')::oid]),
    ('workout_session_legacy_log_select_own', 'workout_session_legacy_log', 'r',
      array[pg_catalog.to_regrole('authenticated')::oid]),
    ('workout_weekly_schedule_select_own', 'workout_weekly_schedule', 'r',
      array[pg_catalog.to_regrole('authenticated')::oid]),
    ('workout_schedule_occurrences_select_own', 'workout_schedule_occurrences', 'r',
      array[pg_catalog.to_regrole('authenticated')::oid]),
    ('workout_schedule_occurrence_exercises_select_own', 'workout_schedule_occurrence_exercises', 'r',
      array[pg_catalog.to_regrole('authenticated')::oid])
),
actual_policies as (
  select p.polname::text as policy_name, c.relname::text as table_name,
         p.polcmd::text as command, p.polroles::oid[] as roles
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (select e.table_name from expected_tables e)
    and p.polpermissive
),
actual_triggers as (
  select t.tgname::text as trigger_name
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
    and t.tgenabled::text in ('O', 'A')
    and t.tgname in (select e.trigger_name from expected_triggers e)
),
expected_rpcs(signature, user_facing) as (
  values
    ('workout_persistence_parse_exercises(text)'::text, false),
    ('workout_persistence_materialize_for_user(uuid)', false),
    ('workout_persistence_guard_session_update()', false),
    ('workout_persistence_guard_exercise_update()', false),
    ('workout_persistence_guard_occurrence_update()', false),
    ('workout_persistence_reject_update()', false),
    ('materialize_my_workout_schedule()', true),
    ('get_pending_workout_occurrence()', true),
    ('start_workout_session(uuid,uuid,uuid)', true),
    ('set_workout_session_exercise_completion(uuid,uuid,boolean)', true),
    ('update_workout_session_note(uuid,text)', true),
    ('abandon_workout_session(uuid)', true),
    ('skip_workout_schedule_occurrence(uuid,text)', true),
    ('update_workout_weekly_schedule(jsonb)', true),
    ('restore_original_workout_schedule()', true),
    ('replace_user_workout_plan(jsonb)', true),
    ('complete_workout_session(uuid)', true)
),
actual_rpcs as (
  select p.oid,
         (p.proname || '(' || pg_catalog.replace(
           pg_catalog.oidvectortypes(p.proargtypes), ' ', ''
         ) || ')')::text as signature,
         p.proname::text as function_name,
         p.proowner as owner_oid,
         p.prosecdef,
         pg_catalog.pg_get_userbyid(p.proowner)::text as owner,
         pg_catalog.array_to_string(p.proconfig, ',')::text as configuration,
         coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner)) as effective_acl
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      select pg_catalog.split_part(e.signature, '(', 1) from expected_rpcs e
    )
),
rpc_acl as (
  select r.signature,
         coalesce(pg_catalog.bool_or(a.grantee = 0 and a.privilege_type = 'EXECUTE'), false)
           as public_execute,
         pg_catalog.has_function_privilege('anon', r.oid, 'EXECUTE') as anon_execute,
         pg_catalog.has_function_privilege('authenticated', r.oid, 'EXECUTE')
           as authenticated_execute,
         pg_catalog.has_function_privilege('service_role', r.oid, 'EXECUTE')
           as service_execute,
         coalesce(pg_catalog.bool_or(
           a.privilege_type = 'EXECUTE'
           and a.grantee not in (
             0, r.owner_oid, pg_catalog.to_regrole('anon')::oid,
             pg_catalog.to_regrole('authenticated')::oid,
             pg_catalog.to_regrole('service_role')::oid
           )
         ), false) as unexpected_execute
  from actual_rpcs r
  cross join lateral pg_catalog.aclexplode(r.effective_acl) a
  group by r.signature, r.oid
),
table_acl_violations as (
  select c.relname::text as table_name,
         case when a.grantee = 0 then 'PUBLIC'
              else pg_catalog.pg_get_userbyid(a.grantee)::text end as grantee,
         a.privilege_type::text
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join expected_tables e on e.table_name = c.relname
  cross join lateral pg_catalog.aclexplode(
    coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
  ) a
  where n.nspname = 'public'
    and not (
      a.grantee = c.relowner
      or (a.grantee = pg_catalog.to_regrole('authenticated')::oid
          and a.privilege_type = 'SELECT')
    )
),
checks(check_order, check_name, status, details) as (
  select 10, 'six_tables_exact_columns',
    case when (select count(*) from expected_tables e
                    where pg_catalog.to_regclass('public.' || e.table_name) is null) = 0
                   and not exists (select 1 from column_delta)
         then 'PASS' else 'FAIL' end,
    pg_catalog.jsonb_build_object(
      'missing_tables', (select pg_catalog.jsonb_agg(e.table_name order by e.table_name)
                         from expected_tables e
                         where pg_catalog.to_regclass('public.' || e.table_name) is null),
      'column_delta', (select pg_catalog.jsonb_agg(to_jsonb(d) order by d.table_name, d.column_name)
                       from column_delta d)
    )
  union all
  select 20, 'pk_fk_unique_delete_behavior',
    case when not exists (select 1 from constraint_delta) then 'PASS' else 'FAIL' end,
    pg_catalog.jsonb_build_object('missing_or_mismatched',
      (select pg_catalog.jsonb_agg(to_jsonb(d) order by d.constraint_name) from constraint_delta d))
  union all
  select 30, 'required_indexes',
    case when not exists (
      select * from expected_indexes except select * from actual_indexes
    ) then 'PASS' else 'FAIL' end,
    pg_catalog.jsonb_build_object('expected', (select pg_catalog.jsonb_agg(to_jsonb(e) order by e.index_name)
                                               from expected_indexes e))
  union all
  select 40, 'rls_owner_and_policies',
    case when (select count(*) from pg_catalog.pg_class c
               join pg_catalog.pg_namespace n on n.oid = c.relnamespace
               join expected_tables e on e.table_name = c.relname
               where n.nspname = 'public' and c.relrowsecurity
                 and pg_catalog.pg_get_userbyid(c.relowner) = 'postgres') = 6
              and not exists (
                (select * from expected_policies except select * from actual_policies)
                union all
                (select * from actual_policies except select * from expected_policies)
              )
         then 'PASS' else 'FAIL' end,
    pg_catalog.jsonb_build_object('expected_tables', 6, 'expected_select_policies', 6)
  union all
  select 50, 'table_acl_allowlist',
    case when not exists (select 1 from table_acl_violations)
              and (select count(*) from pg_catalog.pg_class c
                   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                   join expected_tables e on e.table_name = c.relname
                   where n.nspname = 'public'
                     and pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT')) = 6
         then 'PASS' else 'FAIL' end,
    pg_catalog.jsonb_build_object('violations',
      (select pg_catalog.jsonb_agg(to_jsonb(v) order by v.table_name, v.grantee) from table_acl_violations v))
  union all
  select 60, 'immutability_triggers',
    case when not exists (
      select * from expected_triggers except select * from actual_triggers
    ) then 'PASS' else 'FAIL' end,
    pg_catalog.jsonb_build_object('expected',
      (select pg_catalog.jsonb_agg(e.trigger_name order by e.trigger_name) from expected_triggers e))
  union all
  select 70, 'rpc_exact_signatures_no_overloads',
    case when not exists (
      select e.signature from expected_rpcs e
      except select a.signature from actual_rpcs a
    ) and (select count(*) from actual_rpcs) = 17 then 'PASS' else 'FAIL' end,
    pg_catalog.jsonb_build_object(
      'expected', (select pg_catalog.jsonb_agg(e.signature order by e.signature) from expected_rpcs e),
      'actual', (select pg_catalog.jsonb_agg(a.signature order by a.signature) from actual_rpcs a)
    )
  union all
  select 80, 'rpc_security_and_dormant_acl_allowlists',
    case when not exists (
      select 1
      from expected_rpcs e
      left join actual_rpcs a on a.signature = e.signature
      left join rpc_acl acl on acl.signature = e.signature
      where a.oid is null or not a.prosecdef or a.owner <> 'postgres'
         or a.configuration not in ('search_path=', 'search_path=""')
         or acl.public_execute or acl.anon_execute
         or acl.authenticated_execute or acl.service_execute
         or acl.unexpected_execute
    ) then 'PASS' else 'FAIL' end,
    pg_catalog.jsonb_build_object('phase', 'PHASE_1',
                                  'all_functions_owner_only', true)
  union all
  select 85, 'workout_runtime_activation_state',
    case when (select count(*) from expected_rpcs e where e.user_facing) = 11
              and not exists (
                select 1
                from expected_rpcs e
                left join actual_rpcs a on a.signature = e.signature
                left join rpc_acl acl on acl.signature = e.signature
                where e.user_facing
                  and (a.oid is null or acl.public_execute or acl.anon_execute
                    or acl.authenticated_execute or acl.service_execute
                    or acl.unexpected_execute)
              )
         then 'PASS' else 'FAIL' end,
    pg_catalog.jsonb_build_object(
      'workout_runtime_activation_state',
      case when (select count(*) from expected_rpcs e where e.user_facing) = 11
                 and not exists (
                   select 1
                   from expected_rpcs e
                   left join actual_rpcs a on a.signature = e.signature
                   left join rpc_acl acl on acl.signature = e.signature
                   where e.user_facing
                     and (a.oid is null or acl.public_execute or acl.anon_execute
                       or acl.authenticated_execute or acl.service_execute
                       or acl.unexpected_execute)
                 )
           then 'DORMANT' else 'UNSAFE_OR_PARTIAL' end,
      'expected_user_facing_rpcs', 11
    )
  union all
  select 90, 'legacy_workout_contract_unchanged',
    case when
      (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'workouts'
         and ((column_name = 'id' and data_type = 'uuid' and is_nullable = 'NO')
           or (column_name = 'user_id' and data_type = 'uuid' and is_nullable = 'NO')
           or (column_name = 'title' and data_type = 'text' and is_nullable = 'NO')
           or (column_name = 'exercises' and data_type = 'text' and is_nullable = 'NO')
           or (column_name = 'created_at' and data_type = 'timestamp with time zone' and is_nullable = 'NO'))) = 5
      and
      (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'workout_logs'
         and ((column_name = 'id' and data_type = 'bigint' and is_nullable = 'NO' and is_identity = 'YES')
           or (column_name = 'user_id' and data_type = 'uuid' and is_nullable = 'YES')
           or (column_name = 'workout_id' and data_type = 'uuid' and is_nullable = 'YES')
           or (column_name = 'workout_date' and data_type = 'date' and is_nullable = 'YES'))) = 4
      and exists (
        select 1 from pg_catalog.pg_constraint c
        where c.conrelid = pg_catalog.to_regclass('public.workouts') and c.contype = 'p'
          and (select pg_catalog.array_agg(a.attname::text order by k.ordinality)
               from pg_catalog.unnest(c.conkey) with ordinality k(attnum, ordinality)
               join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
              = array['id']::text[]
      )
      and exists (
        select 1 from pg_catalog.pg_constraint c
        where c.conrelid = pg_catalog.to_regclass('public.workouts') and c.contype = 'f'
          and c.confrelid = pg_catalog.to_regclass('auth.users') and c.confdeltype = 'c'
          and (select pg_catalog.array_agg(a.attname::text order by k.ordinality)
               from pg_catalog.unnest(c.conkey) with ordinality k(attnum, ordinality)
               join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
              = array['user_id']::text[]
      )
      and exists (
        select 1 from pg_catalog.pg_constraint c
        where c.conrelid = pg_catalog.to_regclass('public.workout_logs') and c.contype = 'p'
          and (select pg_catalog.array_agg(a.attname::text order by k.ordinality)
               from pg_catalog.unnest(c.conkey) with ordinality k(attnum, ordinality)
               join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
              = array['id']::text[]
      )
      and not exists (
        select 1 from pg_catalog.pg_constraint c
        where c.conrelid = pg_catalog.to_regclass('public.workout_logs') and c.contype = 'f'
          and (select pg_catalog.array_agg(a.attname::text order by k.ordinality)
               from pg_catalog.unnest(c.conkey) with ordinality k(attnum, ordinality)
               join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
              @> array['workout_id']::text[]
      )
      and not exists (
        select 1 from pg_catalog.pg_index i
        where i.indrelid = pg_catalog.to_regclass('public.workout_logs') and i.indisunique
          and (select pg_catalog.array_agg(a.attname::text order by k.ordinality)
               from pg_catalog.unnest(i.indkey) with ordinality k(attnum, ordinality)
               join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
               where k.attnum > 0) @> array['user_id', 'workout_date']::text[]
      )
      and (select count(*) from pg_catalog.pg_class c
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname in ('workouts', 'workout_logs')
             and c.relrowsecurity and not c.relforcerowsecurity
             and pg_catalog.pg_get_userbyid(c.relowner) not in ('anon', 'authenticated', 'service_role')) = 2
    then 'PASS' else 'FAIL' end,
    pg_catalog.jsonb_build_object('user_rows_read', false)
  union all
  select 100, 'energy_streak_fingerprints_unchanged',
    case when pg_catalog.md5(pg_catalog.pg_get_functiondef(
                pg_catalog.to_regprocedure('public.complete_mission_with_energy(uuid)')
              )) = '4a1deeecb318df2dd76a30a1cd4acb74'
              and pg_catalog.md5(pg_catalog.pg_get_functiondef(
                pg_catalog.to_regprocedure('public.record_user_streak_activity(uuid)')
              )) = '66a1d1b6ad6cdfd150ef06026410320c'
         then 'PASS' else 'FAIL' end,
    pg_catalog.jsonb_build_object('workout_energy_award_implemented', false)
)
select check_name, status, details
from checks
order by check_order;
