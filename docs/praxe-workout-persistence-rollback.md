# PRAXE Workouts persistence rollback plan

Status: manual review plan only. This is not executable SQL and does not
authorize a Production change.

## Principles

The proposed persistence model is additive. Rollback must not delete or rewrite
legacy `workouts`, `workout_logs`, `training_profiles`, missions, profiles,
rewards, Energy or streak state. It must not manufacture legacy history from
session snapshots.

A deployment rollback has two distinct phases:

1. stop new runtime calls to workout persistence RPCs;
2. remove additive database objects only after preserving any real session data
   created since deployment.

Phase 1 is already contained by design: all 11 user-facing RPCs are installed
without effective EXECUTE for PUBLIC, anon, authenticated or service_role. The
repository install migration now expresses this final dormant state. Production
reached the same state through a manual revoke after installation, confirmed by
the read-only dormant-state audit.

## Immediate operational rollback

For a Phase-2 incident, disable the new runtime path first and revoke
authenticated EXECUTE from all 11 user-facing RPCs as the immediate containment
boundary. Then redeploy the previous known application deployment. Do not drop
database objects while any deployed runtime may still call them. The legacy
Workouts UI can continue reading `workouts` and `workout_logs`.

If only one RPC is faulty, revoking that permission may be a short containment
step, but the conservative rollback target is the fully dormant Phase-1 ACL.
Do not broaden table grants as a workaround.

The default database response to an application incident is containment, not
destruction: disable the new runtime path and revoke authenticated EXECUTE on
the affected new RPCs. Keep the six additive tables and their RLS policies in
place whenever they contain sessions, occurrence history, completion state, or
private notes.

## Data preservation decision

Before destructive rollback, audit counts and timestamps using aggregate-only
queries. If any session or occurrence exists, export or archive the additive
tables under an approved data-retention procedure. Notes are private user data
and must not be included in general diagnostic output.

Do not drop populated tables merely to restore application compatibility. The
safe default is to leave additive tables dormant after runtime rollback.

Never delete `workout_logs` rows written by successful session completions.
The one-to-one bridge may be retained dormant so those rows remain attributable
without exposing notes or snapshots. Do not edit, replace, revoke, or otherwise
touch the separately remediated Energy/streak functions as part of this
rollback.

## Dependency-order removal

Only when explicit deletion approval exists and preservation requirements are
satisfied:

1. Revoke authenticated/service EXECUTE on new workout RPCs.
2. Drop only the new RPCs and internal helper functions.
3. Drop new policies, triggers and indexes if not removed with their tables.
4. Drop `workout_session_legacy_log`.
5. Drop `workout_session_exercises`, then `workout_sessions`.
6. Drop `workout_schedule_occurrence_exercises`, then
   `workout_schedule_occurrences`.
7. Drop `workout_weekly_schedule`.

Never drop or alter the shared `reward_system_set_updated_at()` helper unless a
separate dependency audit proves it is safe; this design only consumes it.

Dropping the bridge must not delete referenced legacy logs. Dropping sessions
or occurrences must not cascade into `workouts` or `workout_logs`.

## Verification

After rollback, use a catalog-only audit to confirm:

- all new RPC signatures and EXECUTE grants are absent;
- all six additive tables are absent, if full removal was authorized;
- legacy `workouts`, `workout_logs` and `training_profiles` schemas, RLS,
  policies, owners and grants match their captured preflight state;
- `complete_mission_with_energy`, `record_user_streak_activity` and
  `toggle_mission_with_xp` definitions/fingerprints and ACLs are unchanged;
- no legacy workout logs or source workouts were deleted by rollback.

## Irreversible product effects

Legacy log rows already written by successfully completed sessions are valid
history and remain. Energy awards, if a later separately approved integration
ever creates them, must be handled by the reward system's own incident process;
this rollback must never reverse balances ad hoc.

A database rollback does not restore unsaved client-local workout progress.
