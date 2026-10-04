# PRAXE gamification Production-readiness runbook

Status: historical completed runbook. Production is already in the validated post-`00500`/`00600`/`00700` state. **DO NOT execute or reapply the manual-history SQL.** This document is retained only as validation and operational provenance.

Production has no application migration ledger; no ledger repair was performed. Current deployment policy is defined in `docs/praxe-database-deployment-policy.md`.

## Validated patch set and order

The only Production patch sequence is:

1. `supabase/manual-history/gamification/20261003000500_contain_legacy_mission_rpc.sql`
2. `supabase/manual-history/gamification/20261003000600_reconcile_streak_sync.sql`
3. `supabase/manual-history/gamification/20261003000700_reconcile_chest_currency_ledger.sql`

`00500` contains the legacy mission RPC ACL and installs `complete_mission_with_energy(uuid)`. That successor calls the existing `record_user_streak_activity(uuid)`, so the recorder must exist before `00500`. `00600` then replaces that recorder in place without changing its signature/result contract and adds legacy-profile synchronization. `00700` is structurally independent of the mission/streak functions, but is deliberately last because it is a fingerprint-pinned one-shot replacement of `open_user_chest(uuid)` and should occur only after the first two gates pass.

At the SQL dependency level, `00500` and `00600` can each run when their own preconditions are met; `00700` is independent when all of its strict preconditions are met. Operationally, do not reorder or split the reviewed release: only `00500 -> 00600 -> 00700` reproduces the disposable evidence and preserves the documented stop points.

## Evidence classification

### A. Previously observed in Production by read-only audits

- The substantive gamification relations exist and RLS was enabled on the audited relations.
- `toggle_mission_with_xp(uuid,boolean)` existed, was `SECURITY DEFINER`, had a trusted owner, retained authenticated runtime use, and had the unauthenticated ACL/search-path debt targeted by `00500`.
- `record_user_streak_activity(uuid)` existed with Brazil-date and row-lock signals, a service-only role contract, and no legacy-profile synchronization.
- `open_user_chest(uuid)` matched the reviewed old definition fingerprint `e0e2b37869940e51cf02e3af0ae0ec23`, was authenticated-only, used a trusted owner, was `SECURITY DEFINER`, used an empty `search_path`, and contained ownership/locking/idempotency signals.
- `currency_transactions` was an amount-only ledger and did not have `balance_after`.
- Wallet, chest, reward, idempotency, semantic reward uniqueness, RLS, and non-negative data signals were observed as compatible.

These are historical observations, not proof of current Production state.

### B. Proven only in disposable-v2

- The corrected baseline and patch preflight passed with only the three documented pre-patch warnings.
- `00500` applied; its smoke audit and M01-M07 passed, including exact-once, replay, concurrency, ownership, anonymous denial, ACL, and ledger behavior.
- `00600` applied; S01-S07 passed, including same-day idempotency, next-day/gap/longest logic, profile synchronization, and service-only access.
- `00700` applied; the focused audit reported `POST_00700_CANDIDATE` with 8 PASS / 0 WARN / 0 FAIL and produced reviewed candidate fingerprint `c211e2c8734706c3ddbaf946c283aed4`.
- C01-C06, W01-W03, and R01-R02 passed against the amount-only ledger implementation.
- The final postmigration audit reported 8 PASS / 2 expected WARN / 0 FAIL. The warnings were exactly `legacy_toggle_runtime_debt` and `profiles_direct_write_transition`.

Disposable behavior proves the patch logic against the reconstructed baseline. It does not prove that Production has not drifted.

### C. Fresh Production read-only evidence required

Run `supabase/audits/gamification/audit_praxe_gamification_production_readiness_readonly.sql` immediately before any write authorization and require:

- no `FAIL` and no unexpected warning;
- exact current function signatures, result contracts, owners, security modes, ACLs, search paths, and required body signals;
- exact old `open_user_chest` fingerprint `e0e2b37869940e51cf02e3af0ae0ec23`;
- absence of `currency_transactions.balance_after` and exact amount-only required column types/nullability;
- exact keys, uniqueness indexes, and check constraints required by the patches;
- all required RLS flags enabled;
- zero negative Energy/streak/wallet aggregates and zero relevant mission/reward/currency duplicate groups;
- no existing `complete_mission_with_energy(uuid)` collision;
- no ambiguous `ON CONFLICT (user_id)` recorder target.

Only these preflight warnings are accepted:

- `005_legacy_toggle_contract` when the existing `PUBLIC`/`anon` exposure is the exact debt that `00500` contains;
- `006_recorder_security_and_body` only when the missing signal is legacy `profiles` synchronization, which `00600` adds;
- `profiles_direct_write_transition` only for the authenticated compatibility grant required by current runtime.

Any other warning, any failure, a changed old fingerprint, or a project-identity ambiguity is a stop.

## Runtime compatibility

- Dashboard still calls `toggle_mission_with_xp` in `src/app/dashboard/page.tsx`. `00500` preserves authenticated execution of that legacy RPC while removing `PUBLIC`/`anon`; current Dashboard behavior is therefore retained. The new successor remains dormant until a later runtime cutover.
- Direct `profiles.total_xp` writes remain in Dashboard, Nutrition, Workouts, and the mission-generation route. Direct `profiles.streak` writes remain in Dashboard. Their authenticated database compatibility cannot be revoked in this database-only release.
- No repository runtime caller of `record_user_streak_activity` was found. `00600` preserves its signature/result contract and service-only ACL, so it does not break a client caller; it adds synchronized `profiles` updates for trusted callers such as the successor RPC.
- No repository runtime reference to `currency_transactions.balance_after` was found.
- No repository runtime call to `open_user_chest` was found. Independently, `00700` preserves the public RPC signature/result contract and authenticated-only ACL while replacing only the broken amount-only ledger implementation.

Therefore the reviewed patches preserve current runtime contracts. The two remaining runtime debts are intentional and must remain visible: the Dashboard legacy toggle call and direct authenticated profile writes.

## Historical manual Production procedure (completed; do not rerun)

The following records the completed validation procedure. It is not an executable current runbook and grants no authorization to paste or rerun any SQL.

1. Run only `supabase/audits/gamification/audit_praxe_gamification_production_readiness_readonly.sql`.
2. STOP unless `fail_count=0`, `unexpected_warn_count=0`, and warnings are a subset of the three explicitly accepted warnings above.
3. Record the complete audit result and the pre-change `open_user_chest` fingerprint. Require the exact old fingerprint `e0e2b37869940e51cf02e3af0ae0ec23`.
4. Obtain separate human authorization for the first Production write. Apply only `supabase/manual-history/gamification/20261003000500_contain_legacy_mission_rpc.sql`.
5. Run only `supabase/audits/gamification/audit_praxe_gamification_00500_smoke_readonly.sql`. Require 4 PASS / 0 FAIL and verify legacy authenticated compatibility plus unauthenticated containment.
6. STOP on any exception, unexpected ACL, missing replacement, or audit mismatch. Do not continue to `00600`.
7. Obtain the next explicit authorization. Apply only `supabase/manual-history/gamification/20261003000600_reconcile_streak_sync.sql`.
8. Run the streak-focused catalog checks from the postmigration audit: exact signature/result, trusted owner, `SECURITY DEFINER`, empty search path, service-only ACL, Brazil-date signal, profile/user-streak locking, named-constraint conflict target, and both table-update signals. Do not invoke the recorder against a real user merely to prove behavior.
9. STOP on any mismatch. Do not continue to `00700`.
10. Rerun the focused `00700` audit before applying it. Require `PRE_00700`, old fingerprint `e0e2b37869940e51cf02e3af0ae0ec23`, and zero failures.
11. Obtain the final explicit authorization. Apply `supabase/manual-history/gamification/20261003000700_reconcile_chest_currency_ledger.sql` exactly once.
12. Immediately rerun `supabase/audits/gamification/audit_praxe_gamification_00700_chest_reconciliation_readonly.sql`. Require `POST_00700_CANDIDATE`, 8 PASS / 0 WARN / 0 FAIL, stored-pin equality, and new fingerprint `c211e2c8734706c3ddbaf946c283aed4`.
13. STOP if the phase, fingerprint, stored pin, ACL, contract, schema, or behavior signals differ. Do not rerun `00700`.
14. Run `supabase/audits/gamification/audit_praxe_gamification_patch_postmigration_readonly.sql`. Require 8 PASS / 2 WARN / 0 FAIL, with warnings exactly `legacy_toggle_runtime_debt` and `profiles_direct_write_transition`.
15. Perform only non-mutating Production smoke checks: existing application login/navigation, Dashboard read/render, mission read/render, and ordinary health/log observation. Do not complete a mission, open a chest, alter streak dates, create synthetic users, or create rewards/economic data as part of this runbook.
16. Review all captured outputs and confirm no unexplained application errors, ACL denials, schema-cache errors, or fingerprint drift before declaring the database phase complete.

## STOP conditions

Stop immediately on wrong/ambiguous project identity, any SQL exception, lock timeout, any `FAIL`, any undocumented warning, changed function signature/result/owner/security/ACL/search path, unexpected replacement collision, recorder ambiguity, missing/changed constraint, disabled RLS, negative-data or duplicate aggregate, old chest fingerprint mismatch, post-007 candidate fingerprint mismatch, or runtime regression. Never skip forward after a failed gate.

## Containment without destructive rollback

All three migrations are transactional. If one fails before `COMMIT`, capture the error and audit current state; do not rerun until the cause and transaction outcome are proven. A failed transaction should leave no partial patch state.

If `00500` commits but its audit fails, stop subsequent migrations. Preserve authenticated access needed by the current Dashboard. Contain only confirmed unintended unauthenticated grants with a separately reviewed forward ACL correction; do not delete missions/rewards or replace user state. If runtime regresses, keep legacy authenticated execution available and leave the new successor unused.

If `00600` commits but its audit fails, stop before `00700`, disable no client path, and perform read-only catalog/state diagnosis. Prepare a new forward function correction preserving the exact signature/result contract and all existing profile/streak history. Do not truncate/reseed streaks or restore tables from snapshots.

If `00700` commits but its audit fails, do not rerun it and do not reopen chests for testing. Prefer immediate application-level containment of the chest-open action, or a narrowly reviewed EXECUTE-privilege containment if operationally required and explicitly authorized. Preserve wallet balances, currency/reward ledgers, opened chest state, and all prior rewards. Repair forward with a new fingerprint-pinned migration after read-only diagnosis; never delete ledger rows or reverse chest openings blindly.

For any runtime regression, pause the affected mutation path, retain read access, capture logs/catalog evidence, and prepare a forward fix. No destructive rollback SQL is included or authorized.

## Rerun classification

- `00500`: `SAFE_WITH_PRECONDITIONS`. It remains transactional and enforces its dependencies, but an existing replacement must be reviewed before any repeat.
- `00600`: `SAFE_WITH_PRECONDITIONS`. It replaces the same contract and verifies postconditions; rerun only after reconfirming owner/schema/key state.
- `00700`: `ONE_SHOT_BY_DESIGN`. It requires the exact old definition MD5. After a successful commit the fingerprint necessarily changes, so the precondition rejects a rerun. If its transaction aborts, confirm rollback restored the exact old fingerprint before considering a retry.

## Future commit boundary

Include in the focused gamification reconciliation commit, as non-deployable evidence in their classified directories:

- `supabase/planning/gamification/README.md` and the preserved `00100`–`00400` planning SQL;
- `supabase/manual-history/gamification/README.md` and the preserved `00500`–`00700` manually applied SQL;
- `supabase/audits/gamification/README.md` and all nine reviewed gamification/migration-history read-only audits currently in that directory;
- `supabase/tests/fixtures/gamification/README.md`, the disposable baseline, and the disposable fixture;
- `docs/praxe-database-deployment-policy.md`;
- `docs/praxe-gamification-reconciliation-a2.md`;
- `docs/praxe-gamification-disposable-validation-a3.md`;
- `docs/praxe-gamification-disposable-runbook.md`;
- `docs/praxe-gamification-production-readiness.md`.

Exclude from this focused commit:

- unrelated `docs/praxe-full-product-update-plan.md`;
- all runtime source, package, lockfile, env/config, generated database data, and unrelated migrations;
- any modification to the existing tracked onboarding migration history.

Before staging, use explicit paths only. Directory placement is part of the safety contract: planning, manual-history, audit, and fixture SQL must never be moved back into migration discovery without a separate database-history reconciliation.
