# PRAXE Workouts persistence design

Status: Phase-1 database installation is confirmed in Production and remains
dormant. This document records architecture and deployment state; it does not
authorize SQL execution or Phase-2 runtime activation.

## Production facts preserved

`public.workouts` uses disposable UUID identities and stores exercises as text.
The generator currently deletes a user's workouts and inserts replacements in
separate client operations. `public.workout_logs` is a nullable legacy record
with a bigint identity, no workout foreign key and no completion uniqueness.
These legacy relations are not reshaped or backfilled by this design.

### Consolidated fitness-context compatibility

Workout persistence does not treat `training_profiles.available_weekdays` as a
universal source of truth. The supported physical contracts are:

- pre-V2.2/V2.1: null payload schema version, non-null
  `available_weekdays`, and null `preferred_weekdays`;
- V2.2/schema 3: `onboarding_payload_schema_version = 3`, null
  `available_weekdays`, and non-null validated `preferred_weekdays`.

The fitness-context layer already normalizes these shapes: V2.1 exposes
`availableWeekdays`, while V2.2 exposes `preferredWeekdays`. Workout generation
consumes that normalized DTO. Plan replacement therefore receives an explicit,
validated seven-day schedule from the canonical generator contract; persistence
RPCs do not duplicate onboarding-version branching or read only the legacy
column.

## Canonical model

### Durable sessions

`workout_sessions` is the durable attempt identity. It owns the user, optional
live source workout, optional exact schedule occurrence, immutable title,
nullable scheduled date, lifecycle, timestamps, one private note and a
per-user idempotency UUID. Source deletion uses `ON DELETE SET NULL`; title and
exercise history remain intact.

`workout_session_exercises` stores only `exercise_key`, `name`, `exercise_position`,
`sets`, `reps`, `rest`, `tip_snapshot` and `completed_at`. It contains no media,
provider data or unknown JSON. Completion is independent per child. After the
parent completes, every field except the parent note is immutable.

`workout_session_legacy_log` is a one-to-one bridge from a durable session to
the exact legacy log inserted during completion. This supplies replay safety
without inventing uniqueness on legacy rows.

### Prospective schedule and immutable occurrences

`workout_weekly_schedule` has exactly seven rows per user. Each row contains the
original baseline, current assignment, the current assignment's effective date
and a materialization cursor. A NULL assignment is a rest day. Restore original
means `workout_id := original_workout_id` through the same trusted edit RPC.

`workout_schedule_occurrences` is the immutable dated fact produced when a
scheduled training day becomes due. Its optional source FK uses `ON DELETE SET
NULL`, and it snapshots the title. Bounded occurrence exercise children use the
same allowlist as session exercises. An overdue occurrence therefore survives
schedule edits, week boundaries and source-workout replacement.

Pending is derived, never stored as a boolean: an occurrence is pending when it
is due, is not explicitly skipped, has no completed session and is not held by
an in-progress session. `skipped_at` plus a bounded reason is an explicit,
auditable terminal decision rather than mutable pending state.

## Why explicit occurrences were chosen

| Model | Benefit | Failure mode |
| --- | --- | --- |
| Versioned weekday rows only | Few rows | Disposable workout deletion makes old pending work impossible unless full definitions are also versioned |
| Explicit occurrences | Exact dated facts, FIFO, survives replacement | Adds two small bounded tables |
| Mutable pending flag | Easy query | Loses provenance and becomes nondeterministic across edits |

The canonical choice is explicit occurrence materialization plus a prospective
seven-row schedule. It is the smallest model that satisfies all historical and
replacement guarantees without retaining provider payloads.

## Effective-date rule

Every schedule mutation runs under a per-user transaction lock:

1. Lock all seven schedule rows.
2. Materialize every unprocessed date through the current Brazil date using
   the old assignment.
3. Validate new assignments belong to the authenticated user.
4. Set the new assignment effective on the next Brazil date.
5. Keep already materialized occurrences unchanged.

A plan replacement follows the same rule: the old plan owns today; the new
plan begins tomorrow. A user's first-ever plan may begin today because there is
no earlier plan to preserve.

## Deterministic pending algorithm

1. Materialize all schedule rows through today.
2. Consider occurrences with `scheduled_for_date <= today`.
3. Exclude explicitly skipped occurrences.
4. Exclude occurrences with a completed bound session.
5. Exclude an occurrence while an in-progress session owns it.
6. Order by `scheduled_for_date`, then occurrence UUID; oldest wins.

Starting it binds the session to that occurrence and copies its trusted
snapshots. An ad-hoc session has no occurrence and `scheduled_for_date = NULL`,
so it cannot satisfy a scheduled occurrence. Abandoning a bound session makes
the occurrence eligible again. A second same-day ad-hoc workout is allowed.

## Server-side snapshot parser

The trusted boundary parses `workouts.exercises` from text. It requires a JSON
array of 1–40 objects and rejects malformed, non-array, empty or oversized
input. Required strings are trimmed, non-empty and bounded. Optional strings
are bounded. Only the approved columns are copied.

`exercise_key` uses a bounded `exercise_id`, then bounded `id`, when present.
Otherwise it uses a deterministic digest of normalized name plus zero-based
position. `gif_url`, all URLs, media/provider fields, nested objects and unknown
keys are ignored. The client never supplies a snapshot.

## RPC contracts

### `start_workout_session`

Inputs are source workout UUID, optional occurrence UUID and required
`client_request_id`. The function derives `auth.uid()`, takes the user lock,
returns the existing session on retry, validates ownership, and chooses exactly
one source:

- scheduled: immutable occurrence and its child snapshots;
- ad-hoc: owned live workout parsed server-side.

It creates the session and children atomically and returns durable IDs/state.
It accepts no title, exercise, user, date or status supplied by the client.

### `set_workout_session_exercise_completion`

Locks the owned in-progress session and child, then sets or clears only the
child completion timestamp. Completed and abandoned sessions reject changes.

### `abandon_workout_session`

Locks an owned in-progress session and changes only its status to `abandoned`.
It preserves timestamps/snapshots, is replay-idempotent, and releases a bound
occurrence because abandoned attempts neither satisfy nor reserve it.

### `update_workout_session_note`

Locks an owned session in `in_progress` or `completed`, trims a maximum
2000-character note and changes only the note. Abandoned sessions reject note
changes. A dedicated RPC is safer than a column grant:
the mutable surface and ownership check are explicit and auditable.

### `complete_workout_session`

The function derives the user, locks the session and children, returns the
stored result when already complete, otherwise requires `in_progress` and all
children complete. In one transaction it marks the session complete, inserts
the legacy log, and inserts the one-to-one bridge. The legacy workout date is
the Brazil completion date, not the scheduled date. The source workout UUID is
used only if it still exists; otherwise NULL is written.

This transaction guarantees there is no log without a completed session and no
completed session without its required legacy log. Session identity is the
idempotency boundary; legacy `(user, workout, date)` is not treated as unique.

### Energy/mission boundary

The installed `complete_mission_with_energy(uuid)` is not called by the first
workout completion RPC. Production has not yet proven a unique deterministic
mapping from a completed session to one workout mission for the Brazil date.
Accepting a client mission UUID or choosing an arbitrary row would be unsafe.

The completion result exposes its Brazil completion date to a trusted server
orchestrator. That orchestrator may invoke the idempotent Energy RPC only after
a separate audit proves an exact mission mapping. This ordering can never award
Energy for a workout transaction that failed. Atomic in-database composition
is deferred until the mapping has a reviewed uniqueness contract. No Energy is
guessed or reproduced in workout SQL.

### `replace_user_workout_plan`

The function derives the user and takes the same per-user lock. It validates
the complete bounded plan and explicit schedule produced from normalized
fitness-context before deletion, materializes the old schedule through today,
removes old schedule rows, replaces only the caller's workouts, and seeds seven
new baseline rows. It does not read `available_weekdays` directly. Training rows
set original and current to the new workout; rest rows keep both NULL. Any error
rolls back all steps.

Sessions, occurrences and legacy logs are never updated or deleted. Their live
workout references safely become NULL. The current generator must later call
this boundary instead of client-side delete followed by iterative inserts.

## History contract

New history reads sessions and their snapshots, exposing completion date,
title, real duration (`completed_at - started_at`), lifecycle state, note
preview and exercise detail. Previous-note lookup uses the newest earlier
session for the same surviving workout id, falling back to matching immutable
title only if product review explicitly approves that weaker association.

Legacy log rows remain displayable using only their actual date and surviving
workout relationship. No fake title, duration, note, completion detail or
exercise snapshot is backfilled.

## Security model

All new tables enable RLS. Authenticated users receive SELECT only on their own
rows through ownership policies. They receive no direct INSERT, UPDATE or
DELETE. Mutations use narrow `SECURITY DEFINER` functions with empty
`search_path`, fully qualified objects, derived identity, ownership checks,
row/advisory locking and explicit EXECUTE allowlists. In Phase 1, all 17
functions are owner-only: PUBLIC, anon, authenticated and service_role have no
EXECUTE. Snapshot injection and completed-session mutation are impossible
through table privileges. A separately reviewed Phase-2 cutover may grant
authenticated only the user-facing RPCs actually required by the final runtime.

## Production/repository reconciliation

Production first received the original additive installation and then a manual,
approved revoke of authenticated EXECUTE on all 11 user-facing RPCs. The
catalog-only Production audit subsequently reported
`workout_phase1_dormant_state = PASS`. The install migration in the repository
now directly expresses that intended final Phase-1 state for fresh installs.
This correction does not rewrite or disguise the manual Production sequence;
the manual revoke remains the reconciliation event for that already-applied
environment.

Environments that previously recorded the grant-bearing version of migration
`20261004000300` cannot receive this repository correction by replaying it. A
small, idempotent, separately approved timestamped reconciliation migration is
recommended before Phase 2 so every such environment explicitly revokes all
four non-owner roles. It must not be represented as the original Production
execution and must not be applied automatically merely because this document
recommends it.

## Known cutover requirements

Before Phase 2 is activated, prepare and review the generator and UI changes,
validate the exact RPC caller inventory, convert the blocked ACL draft into an
approved timestamped migration, and separately resolve deterministic
workout-mission mapping if atomic Energy composition is ever required.

## Deployment and later runtime cutover

Phase 1 installs the additive schema and functions with the RPCs dormant. It
creates no schedule, occurrence, session, or legacy-log rows by itself, and the
old runtime continues to use only `workouts` and `workout_logs`. This is safe
before runtime cutover. Once `replace_user_workout_plan` seeds
`workout_weekly_schedule`, its reviewed `ON DELETE RESTRICT` references make the
old delete-first generator fail atomically instead of silently destroying the
live schedule.

The exact safe Phase-2 cutover order is:

1. Keep the Phase-1 ACL dormant and require the catalog-only post-apply audit,
   including `workout_runtime_activation_state = DORMANT`, to PASS.
2. Prepare and review the generator change to call
   `replace_user_workout_plan` and the `WorkoutsExperience` change to use the
   materialize, pending, session, exercise-completion, note, abandon, skip,
   schedule and completion RPCs. Keep the new runtime path disabled.
3. Deploy compatible runtime code with that path still disabled; no request may
   enter it while the RPCs remain dormant.
4. At the controlled cutover, apply only the reviewed authenticated grants for
   the final caller inventory. The blocked draft is not executable authorization.
5. Activate the new runtime path only after the grants are verified. The
   browser and generator route both call as the authenticated user; service_role
   is not required by the reviewed architecture.
6. Verify plan replacement, occurrence FIFO, pending reservation, durable
   history, real duration, note editing and legacy fallback end to end.
7. Remove direct legacy workout mutation paths only after successful verification
   in a subsequent controlled runtime change.
8. Only later investigate a deterministic one-session-to-one-mission mapping
   before proposing any Energy integration.

Stop rather than activating the new runtime if the post-apply audit fails, the
deployed code can reach the new path before ACL verification, the generator
still deletes/inserts directly, any RPC signature differs, or a deterministic
session-to-mission mapping is assumed rather than proven. Database installation
does not authorize RPC use or runtime activation.
