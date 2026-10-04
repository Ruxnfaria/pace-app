# PRAXE Gamification Reconciliation — Phase A.2

Status: historical reconciliation record. Disposable validation completed and `00500`/`00600`/`00700` were manually applied to Production and verified. Their SQL now lives under `supabase/manual-history/gamification/` and **must not be reapplied**. Production has no application migration ledger and no ledger repair was performed.

## Decision summary

Production already contains the substantive gamification foundation. The safe reconciliation is therefore three forward-only patches, not the four original foundation migrations:

1. contain unauthenticated access to the legacy mission RPC and add a secure completion-only replacement for a later runtime cutover;
2. replace the streak recorder in place, preserving its signature while synchronizing `user_streaks` and the legacy `profiles.streak` fields atomically.

No table reconciliation migration is justified for `user_inventory`, `user_boosts`, `currency_transactions`, or chests. The Production contracts are functional, data-preserving supersets or intentional alternative models. Schema churn would add risk without enabling current runtime behavior.

## Runtime dependency inventory

### `profiles.total_xp`

| Runtime flow | Operation | Classification | Revocation impact |
|---|---|---|---|
| Dashboard initial data | read `total_xp` | D — read only | none |
| Dashboard mission toggle | `toggle_mission_with_xp` RPC | C — RPC write | must retain authenticated legacy RPC until cutover |
| Dashboard activity/streak update | browser `profiles.upsert` of `total_xp`, `level`, `streak`, `last_activity_date` | A — client direct write | breaks Dashboard activity update |
| Nutrition mission completion | browser `profiles.update({ total_xp })` | A — client direct write | breaks Nutrition reward flow |
| Workouts mission completion | browser `profiles.update({ total_xp })` | A — client direct write | breaks Workouts reward flow; Workouts is frozen |
| Mission generation API | cookie/user-scoped Supabase client `profiles.update({ total_xp })` | B — server route using user ACL, not service role | breaks mission-generation reward flow |

No service-role implementation currently replaces all four direct/user-scoped writes. Consequently, revoking authenticated/anon column writes in this database-only phase would be a runtime regression. The grants remain an explicit transition warning, not an accepted end state.

### `profiles.streak` and streak RPCs

| Runtime flow | Operation | Classification | Revocation impact |
|---|---|---|---|
| Dashboard activity update | browser `profiles.upsert` of `streak` | A — client direct write | breaks current Dashboard behavior |
| Dashboard, Profile and badge/progress displays | read `profiles.streak` | D — read only | legacy read compatibility required |
| `record_user_streak_activity(uuid)` | no current runtime caller found | E for current runtime; service-only database API | safe to replace in place with same signature/result contract |
| `get_my_streak()` | no current runtime caller found | E for current runtime; read RPC | left unchanged |

The new recorder treats `user_streaks` as the dedicated state, seeds it from legacy profile state only when absent, and writes the resulting value back to `profiles.streak` and `profiles.last_activity_date` in the same transaction. Same-day calls are idempotent; consecutive days increment; gaps reset to one; future stored dates fail closed.

## Legacy mission RPC security analysis

Observed Production state:

- `SECURITY DEFINER`;
- executable by `PUBLIC`, `anon`, and `authenticated`;
- `search_path = public`;
- actively called by the browser Dashboard;
- the authoritative body is not present in repository migration history.

Replacing its body without a locally reviewable contract would be unsafe. Removing authenticated execution would immediately break Dashboard. The containment patch therefore revokes only `PUBLIC` and `anon`, preserves authenticated compatibility, and does not alter the legacy body.

The patch additionally creates `complete_mission_with_energy(uuid)` for a subsequent runtime cutover. It:

- derives the user exclusively from `auth.uid()`;
- accepts no client-supplied user id;
- locks and verifies the owned mission;
- permits completion only and never reverses state;
- returns an already-completed mission without another reward;
- bounds a positive Energy reward;
- updates mission, profile Energy/level, reward ledger, and streak in one transaction;
- writes a deterministic mission idempotency key;
- uses `SECURITY DEFINER` with an empty search path;
- grants execution only to `authenticated` and `service_role`.

The remaining authenticated legacy RPC and direct profile-column grants are deliberate, documented compatibility debt. After runtime cutover they must be removed in a separate final hardening migration.

## Contract reconciliation

### `user_inventory`

Production columns are `id`, `user_id`, `item_id`, `quantity`, `metadata`, `created_at`, and `updated_at`, with a unique user/item contract and non-negative quantity. The proposed old foundation expected `acquired_at` instead of Production's richer `metadata` plus `created_at` representation.

Differences:

- desired-only: `acquired_at`;
- Production-only: `metadata`, `created_at`;
- functional mapping: Production `created_at` is the acquisition timestamp;
- constraints/defaults: Production already supports quantity ownership and metadata without data loss.

Decision: no patch. Production already satisfies the intended runtime capability and is a compatible richer contract.

### `user_boosts`

Production is a timed multiplier model with `id`, `user_id`, `boost_type`, `multiplier`, required `starts_at`, required `expires_at`, `source_type`, `source_id`, `consumed_at`, `metadata`, and `created_at`. It validates an energy-multiplier boost, multiplier greater than one, expiration after start, and consumed-state consistency.

The expected schema that produced the incompatible result had four absent columns:

- `item_id`;
- `status`;
- `quantity`;
- `updated_at`.

It also expected two nullability differences:

- `starts_at` nullable rather than Production `NOT NULL`;
- `expires_at` nullable rather than Production `NOT NULL`.

Decision: this is an expected-schema mismatch, not evidence that Production is defective. No current runtime uses boosts, and Production's bounded timed-multiplier contract is internally coherent and stricter. No patch is created.

### Currency ledger

`balance_after` is absent, but the current wallet supports real balance display, atomic credit/debit, non-negative balance protection, idempotency/source constraints, and ledger auditability. Adding a snapshot balance would require a carefully ordered historical backfill and concurrency semantics without enabling a current requirement.

Decision: do not add `balance_after` in Phase A.2.

### Chests

`open_user_chest(uuid)` was reported as an exact semantic match and existing chest/loot rows are valid. The chest RPC and tables are frozen. The patch files do not replace the function or alter chest tables/catalogs. Both audits expose a function-definition fingerprint and safety signals for before/after comparison.

Disposable C01 later exercised the deterministic crystal branch and reproduced
`ERROR 42703: column "balance_after" of relation "currency_transactions" does
not exist`. The reviewed old function fingerprint was
`e0e2b37869940e51cf02e3af0ae0ec23`, and the failed call rolled back the prior
wallet mutation atomically. Reconciliation therefore selected Option B:
`supabase/manual-history/gamification/20261003000700_reconcile_chest_currency_ledger.sql` replaces only
`open_user_chest(uuid)` so its crystal insert uses the existing amount-only
ledger contract. It does not add or backfill `balance_after`. The migration
derives and stores the new function fingerprint after replacement; that value
must be captured and reviewed after disposable application. Production remains
prohibited until C01–C06, W01–W03, R01–R02 and the postmigration audit all
complete without a blocker.

## Patch files

1. `supabase/manual-history/gamification/20261003000500_contain_legacy_mission_rpc.sql`
   - preconditions required objects and trusted legacy owner;
   - revokes legacy RPC from `PUBLIC` and `anon` only;
   - preserves authenticated runtime compatibility;
   - creates the secure replacement RPC;
   - validates the resulting grants before commit.
2. `supabase/manual-history/gamification/20261003000600_reconcile_streak_sync.sql`
   - preserves the deployed signature and returned columns;
   - replaces the service-only recorder with atomic dedicated/legacy synchronization;
   - retains service-only execution and an empty search path.
3. `supabase/manual-history/gamification/20261003000700_reconcile_chest_currency_ledger.sql`
   - requires the reviewed old chest-function fingerprint and amount-only ledger;
   - preserves the RPC signature, result, security, locking and replay behavior;
   - removes only the invalid physical `balance_after` insert dependency;
   - derives, stores and emits the new fingerprint for disposable review.

The four earlier `00100`–`00400` migrations remain historical planning artifacts and must not be used as Production writes.

## Security model after these patches

- unauthenticated users cannot execute either mission-write RPC;
- the new mission RPC is authentication-bound, ownership-bound, row-locked, completion-only, and ledger-backed;
- the old mission RPC remains authenticated temporarily because the Dashboard still calls it;
- the streak write RPC remains service-only and synchronizes both representations;
- RLS remains enabled and unchanged;
- direct client writes to `profiles.total_xp` and `profiles.streak` remain temporarily available because active runtime flows depend on them;
- chest/wallet table schemas, catalogs, inventory, and boosts remain unchanged;
- `open_user_chest(uuid)` is reconciled to the existing amount-only ledger.

This is a safe transition state, not the final Energy ACL state.

## Disposable validation plan

Use a disposable Supabase project or an isolated local PostgreSQL environment seeded from a sanitized schema/data snapshot. Never point the validation commands at Production.

1. Capture the pre-patch `open_user_chest` definition fingerprint and run `supabase/audits/gamification/audit_praxe_gamification_patch_preflight_readonly.sql`. Expected: no `FAIL`; warnings identify legacy RPC/client-write transition debt.
2. Apply `supabase/manual-history/gamification/20261003000500_contain_legacy_mission_rpc.sql`, then `supabase/manual-history/gamification/20261003000600_reconcile_streak_sync.sql` in order. Confirm both transactions commit.
3. Reset the fixture, run the focused 00700 audit in `PRE_00700`, apply `supabase/manual-history/gamification/20261003000700_reconcile_chest_currency_ledger.sql` once, rerun the audit in `POST_00700_CANDIDATE`, and capture the new fingerprint.
4. As anonymous, call the legacy and replacement mission RPCs. Both must be denied.
5. As authenticated user A, attempt to complete user B's mission through the replacement. It must fail as not found and write nothing.
6. Complete user A's incomplete mission. Verify one mission transition, exactly one Energy increment, level recomputation, one reward row, and streak/profile synchronization.
7. Repeat the same mission completion. Verify `completed_now=false`, zero Energy awarded, unchanged balance, and no second reward row.
8. Exercise concurrent completion with two sessions. Verify at most one successful transition/reward and no double claim.
9. Validate invalid/zero/excessive mission rewards fail and roll back all writes.
10. Test streak on the same Brazil calendar day, next day, after a gap, and with a future stored date. Verify idempotence, increment, reset, and fail-closed behavior respectively, with `profiles.streak` equal to `user_streaks.current_streak` after success.
11. Exercise wallet credit and debit using existing controlled paths. Verify atomicity, idempotent replay, and rejection of a negative resulting balance.
12. Open an eligible chest and repeat the same request. Verify the established result, one opening only, correct crystal/item grant, and no repeat grant.
13. Validate RLS for cross-user reads/writes across missions, wallet, rewards, streaks, inventory, and chests.
14. Run `supabase/audits/gamification/audit_praxe_gamification_patch_postmigration_readonly.sql`. Expected transition result is `WARN`, not `FAIL`, only for the documented runtime debts.
15. Confirm the focused and full postmigration audits report the same stored new chest fingerprint, that it differs from the reviewed old fingerprint, and review it before Production consideration.

## Required follow-up before final ACL hardening

Move Dashboard, Nutrition, Workouts, and mission-generation Energy writes to reviewed controlled server/RPC paths; switch Dashboard mission completion to `complete_mission_with_energy`; migrate streak reads to `user_streaks` with legacy fallback; validate the full runtime in Preview. Only then create a separate migration that revokes authenticated execution of the legacy toggle and removes direct `total_xp`/`streak` client writes (retaining only any narrowly proven profile-creation privilege).

Exact next human action: review migration 00700 and its focused audit, then execute the documented continuation in disposable-v2. Do not apply any migration to Production during this phase.
