# Workout Phase-1 ACL reconciliation local integration test

Status: executed and passed. This test is not Phase 2 and never grants
application access to the Workout persistence RPCs.

Final result:

```text
PRAXE WORKOUT PHASE-1 LOCAL TEST: PASS
```

## Isolation contract

The test reuses `local-postgres.mjs` and the already-installed PostgreSQL 17.6
embedded runtime. It creates a fresh cluster in the ignored
`node_modules/.cache/onboarding-v22/` directory, binds only to literal
`127.0.0.1` on an ephemeral port with SSL disabled, and stops the server in
guaranteed cleanup.

The test rejects database/Supabase connection environment variables, does not
load `.env`, accepts no URL or host, imports no Supabase client, and uses no API
key or real service-role credential. It must never be adapted to accept an
external connection string.

## Authenticated Production checkpoint

The test uses the authenticated Production post-audit snapshot stored at:

`supabase/tests/fixtures/workout-phase1-production-function-snapshots.json`

It contains the complete `pg_get_functiondef()` output captured for:

- `public.record_user_streak_activity(uuid)` — raw MD5
  `66a1d1b6ad6cdfd150ef06026410320c`
- `public.complete_mission_with_energy(uuid)` — raw MD5
  `4a1deeecb318df2dd76a30a1cd4acb74`

Before PostgreSQL starts, the harness validates each signature, the declared
MD5, and the UTF-8 MD5 of each stored definition. It then renders the test-only
checkpoint template:

`supabase/tests/fixtures/workout-phase1-post-energy-checkpoint.sql`

Immediately before the Workout install migration, the harness reads the two
functions back through `pg_get_functiondef()` and requires the same exact raw
Production MD5 values. A mismatch stops the test before Workout installation.

The snapshot and checkpoint are test-only reconstruction artifacts. They do
not replace, modify, bypass, or weaken the real Energy/streak migrations or
their fingerprint preflights.

## Bootstrap and execution order

The baseline fixture supplies local Supabase-equivalent roles and the minimal
legacy schema needed by the historical migrations. The harness then executes:

1. `workout-phase1-baseline.sql`
2. `20260907000100_reward_system_foundation.sql`
3. `20260909000200_user_streaks.sql`
4. `20260911000100_add_current_mission_unique_index.sql`
5. The authenticated `workout-phase1-post-energy-checkpoint.sql`
6. Exact raw fingerprint gates for the streak recorder and Energy function
7. `20261004000300_add_praxe_workout_persistence.sql`
8. Initial DORMANT-state verification
9. `20261005000100_reconcile_praxe_workout_phase1_dormant_acl.sql`
10. The same reconciliation migration a second time
11. Exact catalog-state comparison proving idempotence
12. `audit_praxe_workout_persistence_postapply_READONLY.sql`

The current local-test track intentionally does **not** execute:

- `20261004000100_restore_complete_mission_with_energy_and_contain_legacy_toggle.sql`
- `20261004000200_sync_streak_recorder_to_profile_compatibility.sql`

Those migrations have strict raw `pg_get_functiondef()` fingerprint gates tied
to the exact pre-remediation serialization observed in Production. Recreating
their logical predecessor definitions from migration source on PostgreSQL 17.6
does not guarantee byte-identical catalog serialization. The authenticated
checkpoint reconstructs the already-reconciled Production dependency state
without changing the migrations, expected fingerprints, or preflight rules.

## Validated result

The authorized embedded-PostgreSQL run completed successfully:

- Workout Phase-1 install: PASS
- Initial runtime activation state: DORMANT PASS
- ACL reconciliation #1: PASS
- ACL reconciliation #2: PASS
- Exact idempotence comparison: PASS
- Post-apply audit: 11/11 checks PASS
- Final `workout_runtime_activation_state`: DORMANT

All 17 Workout functions existed, remained owned by `postgres`, preserved their
definition fingerprints, and denied effective EXECUTE to PUBLIC, anon,
authenticated, service_role, and every unexpected non-owner grantee.

## Command — run only with explicit approval

```powershell
node --test supabase/tests/workout-phase1-acl-reconciliation.integration.test.mjs
```

Do not run this test with `ONBOARDING_TEST_ENGINE=pglite`; native PostgreSQL is
required for the primary result. No Supabase CLI, `db push`, `db reset`,
`supabase link`, Production project, or cutover draft belongs in this workflow.
