-- Activate only the reviewed public Workout runtime RPC surface.
-- Internal helpers remain owner-only and no function definition is changed.

begin;

do $preflight$
declare
  v_expected record;
  v_oid oid;
  v_owner text;
  v_security_definer boolean;
  v_configuration text;
begin
  if pg_catalog.to_regrole('anon') is null
     or pg_catalog.to_regrole('authenticated') is null
     or pg_catalog.to_regrole('service_role') is null then
    raise exception 'Workout ACL activation preflight failed: an expected Supabase role is missing';
  end if;

  for v_expected in
    select expected.signature, expected.user_facing
    from (values
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
    ) as expected(signature, user_facing)
  loop
    v_oid := pg_catalog.to_regprocedure('public.' || v_expected.signature);

    if v_oid is null then
      raise exception 'Workout ACL activation preflight failed: missing function public.%',
        v_expected.signature;
    end if;

    select pg_catalog.pg_get_userbyid(p.proowner)::text,
           p.prosecdef,
           pg_catalog.array_to_string(p.proconfig, ',')::text
      into v_owner, v_security_definer, v_configuration
    from pg_catalog.pg_proc p
    where p.oid = v_oid;

    if v_owner <> 'postgres' then
      raise exception 'Workout ACL activation preflight failed: public.% owner is %, expected postgres',
        v_expected.signature, v_owner;
    end if;

    if v_expected.user_facing
       and (not v_security_definer
         or v_configuration is null
         or v_configuration not in ('search_path=', 'search_path=""')) then
      raise exception 'Workout ACL activation preflight failed: public.% must be SECURITY DEFINER with empty search_path',
        v_expected.signature;
    end if;
  end loop;
end
$preflight$;

revoke execute on function public.materialize_my_workout_schedule()
  from public, anon, authenticated, service_role;
grant execute on function public.materialize_my_workout_schedule()
  to authenticated;

revoke execute on function public.get_pending_workout_occurrence()
  from public, anon, authenticated, service_role;
grant execute on function public.get_pending_workout_occurrence()
  to authenticated;

revoke execute on function public.start_workout_session(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.start_workout_session(uuid, uuid, uuid)
  to authenticated;

revoke execute on function public.set_workout_session_exercise_completion(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_workout_session_exercise_completion(uuid, uuid, boolean)
  to authenticated;

revoke execute on function public.update_workout_session_note(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_workout_session_note(uuid, text)
  to authenticated;

revoke execute on function public.abandon_workout_session(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.abandon_workout_session(uuid)
  to authenticated;

revoke execute on function public.skip_workout_schedule_occurrence(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.skip_workout_schedule_occurrence(uuid, text)
  to authenticated;

revoke execute on function public.update_workout_weekly_schedule(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.update_workout_weekly_schedule(jsonb)
  to authenticated;

revoke execute on function public.restore_original_workout_schedule()
  from public, anon, authenticated, service_role;
grant execute on function public.restore_original_workout_schedule()
  to authenticated;

revoke execute on function public.replace_user_workout_plan(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.replace_user_workout_plan(jsonb)
  to authenticated;

revoke execute on function public.complete_workout_session(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_workout_session(uuid)
  to authenticated;

revoke execute on function public.workout_persistence_parse_exercises(text)
  from public, anon, authenticated, service_role;
revoke execute on function public.workout_persistence_materialize_for_user(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.workout_persistence_guard_session_update()
  from public, anon, authenticated, service_role;
revoke execute on function public.workout_persistence_guard_exercise_update()
  from public, anon, authenticated, service_role;
revoke execute on function public.workout_persistence_guard_occurrence_update()
  from public, anon, authenticated, service_role;
revoke execute on function public.workout_persistence_reject_update()
  from public, anon, authenticated, service_role;

do $postconditions$
declare
  v_expected record;
  v_oid oid;
  v_owner_oid oid;
  v_owner text;
  v_security_definer boolean;
  v_configuration text;
  v_public_execute boolean;
  v_authenticated_direct_execute boolean;
  v_unexpected_execute_grantees text[];
begin
  for v_expected in
    select expected.signature, expected.user_facing
    from (values
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
    ) as expected(signature, user_facing)
  loop
    v_oid := pg_catalog.to_regprocedure('public.' || v_expected.signature);

    if v_oid is null then
      raise exception 'Workout ACL activation postcondition failed: missing function public.%',
        v_expected.signature;
    end if;

    select p.proowner,
           pg_catalog.pg_get_userbyid(p.proowner)::text,
           p.prosecdef,
           pg_catalog.array_to_string(p.proconfig, ',')::text,
           exists (
             select 1
             from pg_catalog.aclexplode(
               coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
             ) acl
             where acl.grantee = 0
               and acl.privilege_type = 'EXECUTE'
           ),
           exists (
             select 1
             from pg_catalog.aclexplode(
               coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
             ) acl
             where acl.grantee = pg_catalog.to_regrole('authenticated')::oid
               and acl.privilege_type = 'EXECUTE'
           ),
           (
             select pg_catalog.array_agg(
                      case when acl.grantee = 0 then 'PUBLIC'
                           else pg_catalog.pg_get_userbyid(acl.grantee)::text end
                      order by acl.grantee
                    )
             from pg_catalog.aclexplode(
               coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
             ) acl
             where acl.privilege_type = 'EXECUTE'
               and acl.grantee <> p.proowner
               and (
                 not v_expected.user_facing
                 or acl.grantee <> pg_catalog.to_regrole('authenticated')::oid
               )
           )
      into v_owner_oid, v_owner, v_security_definer, v_configuration,
           v_public_execute, v_authenticated_direct_execute,
           v_unexpected_execute_grantees
    from pg_catalog.pg_proc p
    where p.oid = v_oid;

    if v_owner <> 'postgres' then
      raise exception 'Workout ACL activation postcondition failed: public.% owner is %, expected postgres',
        v_expected.signature, v_owner;
    end if;

    if v_expected.user_facing
       and (not v_security_definer
         or v_configuration is null
         or v_configuration not in ('search_path=', 'search_path=""')) then
      raise exception 'Workout ACL activation postcondition failed: public.% security metadata changed',
        v_expected.signature;
    end if;

    if v_public_execute
       or pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE')
       or v_unexpected_execute_grantees is not null then
      raise exception 'Workout ACL activation postcondition failed: public.% has an unauthorized EXECUTE path',
        v_expected.signature;
    end if;

    if v_expected.user_facing then
      if not v_authenticated_direct_execute
         or not pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE') then
        raise exception 'Workout ACL activation postcondition failed: authenticated cannot EXECUTE public.%',
          v_expected.signature;
      end if;
    elsif v_authenticated_direct_execute
       or pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      raise exception 'Workout ACL activation postcondition failed: authenticated can EXECUTE helper public.%',
        v_expected.signature;
    end if;
  end loop;
end
$postconditions$;

commit;
