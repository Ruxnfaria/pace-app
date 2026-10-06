-- TEST ONLY. Never run this file directly or against an existing database.
--
-- The local harness replaces the two marker lines below with the exact
-- function_definition strings from praxe_production_function_snapshots.json.
-- Substitution happens after JSON parsing and preserves the authenticated
-- strings byte-for-byte, including the CRLF function bodies captured by the
-- Production post-audit. The trailing semicolons belong to this SQL template;
-- pg_get_functiondef() itself does not include them.
--
-- This checkpoint reconstructs the already-reviewed Production state after
-- streak/profile compatibility sync and Energy remediation. It is not a
-- migration and does not replace or weaken either remediation migration.

begin;

-- {{PRODUCTION_RECORD_USER_STREAK_ACTIVITY_FUNCTION_DEFINITION}};

alter function public.record_user_streak_activity(uuid) owner to postgres;
revoke all on function public.record_user_streak_activity(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.record_user_streak_activity(uuid)
to service_role;

-- {{PRODUCTION_COMPLETE_MISSION_WITH_ENERGY_FUNCTION_DEFINITION}};

alter function public.complete_mission_with_energy(uuid) owner to postgres;
revoke all on function public.complete_mission_with_energy(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.complete_mission_with_energy(uuid)
to authenticated, service_role;

comment on function public.complete_mission_with_energy(uuid) is
  'Authenticated ownership-bound, completion-only mission Energy grant.';

revoke execute on function public.toggle_mission_with_xp(uuid, boolean)
from public, anon;
grant execute on function public.toggle_mission_with_xp(uuid, boolean)
to authenticated, service_role;

commit;
