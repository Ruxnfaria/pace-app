TEST DATABASE ONLY

NEVER RUN THESE STEPS IN PRODUCTION

# PRAXE Gamification Disposable Database Runbook

Operator: ____________________  Date/time: ____________________

Temporary Supabase project name/reference: ____________________

Production project reference, used only for visual mismatch checking: ____________________

This runbook performs manual setup and validation only. It does not authorize Production SQL, a remote Production connection, runtime/UI changes, commit, push, merge, or deployment.

## Baseline provenance and limitations

The available repository does not contain authoritative creation migrations for `profiles`, `daily_missions`, `toggle_mission_with_xp`, or the old migration-ledger versions `20260907000100`, `20260907000200`, `20260909000200`, and `20260911000100`. Repository history search found no deleted copies.

The disposable baseline is consequently a minimum manual reconstruction, not a Production schema dump. Its evidence sources are:

| Object group | Source classification | Evidence/use |
|---|---|---|
| `auth.users`, JWT roles, `auth.uid()` | Supabase-managed | Supplied by a hosted temporary project; baseline verifies rather than creates them |
| `profiles` | Production object without a creation migration | Reconstructed from the tracked onboarding test fixture, runtime columns, onboarding migrations and Production ACL audit |
| `daily_missions` | Production object without a creation migration | Reconstructed from runtime operations, `00400` contract and mission-integrity audit |
| Reward/chest/streak tables | Production objects; local `00100`–`00300` are non-authoritative planning artifacts | Production audit determines deviations; local files supply compatible contract details only |
| `open_user_chest(uuid)` | Production audit reports `EXACT_MATCH`; locally reviewed body exists in `00200` | Body copied unchanged into disposable baseline |
| Legacy `toggle_mission_with_xp(uuid,boolean)` | Production-only body absent from Git | Minimal ownership-bound legacy behavior reconstructed with the observed unsafe ACL/search path |
| `record_user_streak_activity(uuid)` | Production function; exact creation migration absent | Pre-006 behavior reconstructed with Brazil date, row lock, service-only grant and no profile sync; return contract selected to match reviewed `00600` |
| `get_my_streak()` | Production function; local `00300` reference | Compatible read/fallback implementation reproduced |
| Indexes, triggers, RLS, policies, grants | Mixed Production audit plus local contract evidence | Only patch/test-relevant controls reproduced |

Reliable tracked migrations beginning at `20260912000100` alter an already existing `profiles` table; they cannot bootstrap it. `20261002000100_harden_profiles_client_acl.sql` is a reliable ACL hardening artifact but also assumes the complete prior profile contract. Do not replay the normal migration directory into an empty project for this exercise.

The files `20261003000100`–`00400` remain explicitly prohibited as deployment migrations. The baseline copies only the minimum reviewed contracts needed by the disposable tests.

### M01 recorder ambiguity discovered during disposable validation

The first disposable M01 run failed inside the reconstructed pre-`00600` recorder because `RETURNS TABLE` declares an OUT parameter named `user_id`, making the original `ON CONFLICT (user_id)` target ambiguous in PL/pgSQL. This is a reconstruction defect and does not prove that Production has the same function body.

The baseline now uses the unambiguous existing primary-key constraint target `ON CONFLICT ON CONSTRAINT user_streaks_pkey`. Row locking, upsert behavior, service-only access and the same-transaction streak call are unchanged.

Static review also found `ON CONFLICT (user_id)` inside `supabase/manual-history/gamification/20261003000600_reconcile_streak_sync.sql`, whose `RETURNS TABLE` declares the same OUT parameter. The patch now targets `user_streaks_pkey` explicitly and its transaction preflight verifies that this named constraint is a single-column primary key over `user_id` before `CREATE OR REPLACE`. The already-used disposable database must not be hot-fixed or reused: create a new test database from the corrected baseline and restart validation at Step 1.

## Chest discrepancy — reproduced blocker and forward reconciliation

The locally reviewed `open_user_chest(uuid)` body does reference `currency_transactions.balance_after`, specifically inside the `reward_type = 'crystals'` branch after the wallet update. It is conditional: Energy rewards do not touch that column.

The Production audit reported:

- `open_user_chest(uuid)`: `EXACT_MATCH`;
- `currency_transactions`: compatible but different;
- `balance_after`: absent.

These facts can coexist because PL/pgSQL can retain a function whose conditional statement is resolved only when that branch executes. Therefore:

- the disposable baseline intentionally omits `balance_after`;
- it intentionally preserves the reviewed chest function body;
- Energy-only chest validation should execute;
- the deterministic crystal-only C01 test reproduced `ERROR 42703` at the ledger insert;
- the failed call rolled back the preceding wallet mutation atomically;
- Option B was selected: `supabase/manual-history/gamification/20261003000700_reconcile_chest_currency_ledger.sql` replaces only `open_user_chest(uuid)` and writes the existing amount-only ledger shape;
- the baseline remains intentionally pre-`00700` and broken so the migration itself proves the repair;
- the reviewed old fingerprint is `e0e2b37869940e51cf02e3af0ae0ec23`;
- the migration derives and stores the new fingerprint; it must be captured from the disposable audit after `00700` and reviewed before any Production proposal;
- C01–C06, W01–W03, R01–R02 and the full postmigration audit must pass after `00700`.

Observed C01 blocker: `42703 balance_after` — reproduced in disposable-v2.

## Manual checklist

For every step, record `PASS`, `FAIL`, or `N/A`, attach the non-secret output, and obey its STOP rule.

### 1. Create temporary Supabase project

Status: ______  Evidence: _________________________________________________

- Create a new temporary hosted Supabase project.
- Do not branch/copy Production data.
- Use a new project name and reference visibly different from Production.
- Do not configure application/Vercel environment variables against it.

STOP if project isolation or ownership is unclear.

### 2. Confirm the project is not Production

Status: ______  Evidence: _________________________________________________

- Compare the temporary project name/reference/host with the known Production reference.
- Confirm the public application schema is empty.
- Confirm no real user or application rows exist.
- Confirm the SQL editor banner/project selector shows the temporary project.

STOP on any match with Production or any unexpected application data.

### 3. Apply the disposable baseline schema

Status: ______  Evidence: _________________________________________________

Open: `supabase/tests/fixtures/gamification/test_praxe_gamification_disposable_baseline.sql`.

In one SQL editor execution batch, place the following confirmation immediately before the full baseline file:

```sql
create temporary table praxe_disposable_baseline_confirmation(
  token text primary key
);
insert into praxe_disposable_baseline_confirmation values
  ('I_CONFIRM_THIS_EMPTY_PROJECT_IS_NOT_PRODUCTION');
```

Expected final row:

- `status=DISPOSABLE_BASELINE_CREATED`;
- `currency_transactions_has_balance_after=false`;
- `open_user_chest_references_balance_after=true`;
- `crystal_branch_state=EXPECTED_FAILURE_GATE`.

STOP on a safety-gate failure, object collision, missing Supabase role/auth function, or any unexpected SQL error. Do not make the script permissive with `IF NOT EXISTS`.

### 4. Create two synthetic Auth users manually

Status: ______  Evidence: _________________________________________________

In the temporary project's Auth dashboard create and confirm:

- `user_a@praxe.invalid`
- `user_b@praxe.invalid`

Choose unique temporary passwords manually. Do not write passwords, access tokens, refresh tokens, JWTs, service keys, or connection strings into this repository or validation evidence.

STOP if either address differs, maps to an existing real identity, or cannot be confirmed.

### 5. Bootstrap the two synthetic profiles

Status: ______  Evidence: _________________________________________________

In the temporary SQL editor only, run:

```sql
insert into public.profiles (
  user_id,
  nome,
  total_xp,
  level,
  streak,
  onboarding_completed
)
select
  auth_user.id,
  case auth_user.email
    when 'user_a@praxe.invalid' then 'Synthetic User A'
    else 'Synthetic User B'
  end,
  0,
  1,
  0,
  false
from auth.users as auth_user
where auth_user.email in ('user_a@praxe.invalid', 'user_b@praxe.invalid')
on conflict (user_id) do nothing;

select count(*)::integer as synthetic_profiles
from public.profiles as profile
join auth.users as auth_user on auth_user.id = profile.user_id
where auth_user.email in ('user_a@praxe.invalid', 'user_b@praxe.invalid');
```

Expected: `synthetic_profiles=2`.

STOP unless the count is exactly two.

### 6. Load the synthetic fixture

Status: ______  Evidence: _________________________________________________

Open: `supabase/tests/fixtures/gamification/test_praxe_gamification_disposable_fixture.sql`.

In one SQL editor execution batch, place this confirmation immediately before the entire fixture:

```sql
create temporary table praxe_disposable_confirmation(token text primary key);
insert into praxe_disposable_confirmation values
  ('I_CONFIRM_THIS_IS_NOT_PRODUCTION');
```

Expected fixture summary:

- two synthetic users only;
- A: 100 Energy, streak 2, wallet 20, two missions, two chests;
- B: 75 Energy, streak 0, wallet 5, one mission, zero chests.

STOP on any non-synthetic identity, missing profile, constraint error, or count mismatch.

### 7. Run patch preflight

Status: ______  Evidence: _________________________________________________

Open and run: `supabase/audits/gamification/audit_praxe_gamification_patch_preflight_readonly.sql`.

Expected: `fail_count=0`. Accepted warnings only:

- `legacy_toggle_containment_precondition`;
- `streak_recorder_precondition`;
- `profiles_legacy_client_writes`.

Record `open_user_chest` preflight MD5: ______________________________

STOP on every `FAIL` or undocumented warning.

### 8. Confirm preflight gate

Status: ______  Reviewer initials: ______

Confirm `FAIL=0` and only the warning allowlist above. STOP otherwise.

### 9. Apply `00500`

Status: ______  Evidence: _________________________________________________

Open and run only: `supabase/manual-history/gamification/20261003000500_contain_legacy_mission_rpc.sql`.

Expected: transaction commits without precondition/postcondition exception.

STOP on any error. Do not manually continue half the sequence.

### 10. Run the `00500` smoke audit

Status: ______  Evidence: _________________________________________________

Open and run: `supabase/audits/gamification/audit_praxe_gamification_00500_smoke_readonly.sql`.

Expected: `overall_status=PASS`, `fail_count=0`.

STOP on every failure.

### 11. Execute M01–M07

Status: ______  Evidence reference: _______________________________________

Use the mission matrix and identity/concurrency harness in `docs/praxe-gamification-disposable-validation-a3.md`.

M01 ___ M02 ___ M03 ___ M04 ___ M05 ___ M06 ___ M07 ___

STOP on duplicate Energy/reward, unauthorized execution, ownership failure, partial state, or missing row-lock serialization.

### 12. Apply `00600`

Status: ______  Evidence: _________________________________________________

Open and run only: `supabase/manual-history/gamification/20261003000600_reconcile_streak_sync.sql`.

Use only the reviewed version whose conflict target is `ON CONFLICT ON CONSTRAINT user_streaks_pkey` and whose precondition validates that exact primary key. This step is permitted only in the newly rebuilt disposable after Steps 1–11 pass again; never continue from the old disposable.

Expected: transaction commits without precondition/postcondition exception.

STOP on any error, including a return-type replacement error. Such an error proves the disposable function contract does not match the patch and requires reconciliation before continuing.

### 13. Execute S01–S07

Status: ______  Evidence reference: _______________________________________

S01 ___ S02 ___ S03 ___ S04 ___ S05 ___ S06 ___ S07 ___

STOP on incorrect date transition, same-day increment, lost longest streak, profile/dedicated mismatch, or client execution of the service-only recorder.

### 14. Reset fixture before `00700`

Status: ______  Evidence reference: _______________________________________

Re-run the existing synthetic fixture reset in the current disposable-v2. The
failed pre-`00700` C01 rolled back atomically, but reset remains mandatory so
wallet, chest and ledger counts start from the documented values.

### 15. Run focused `00700` preflight

Status: ______  Evidence reference: _______________________________________

Run `supabase/audits/gamification/audit_praxe_gamification_00700_chest_reconciliation_readonly.sql`.
Expected: `PRE_00700`, fingerprint
`e0e2b37869940e51cf02e3af0ae0ec23`, and `fail_count=0`.

### 16. Apply `00700` once

Status: ______  Evidence reference: _______________________________________

Run only `supabase/manual-history/gamification/20261003000700_reconcile_chest_currency_ledger.sql`. STOP on any
precondition or postcondition exception. Do not alter the amount-only ledger
schema.

### 17. Run focused `00700` postcondition audit

Status: ______  Evidence reference: _______________________________________

Re-run `supabase/audits/gamification/audit_praxe_gamification_00700_chest_reconciliation_readonly.sql`.
Expected: `POST_00700_CANDIDATE`, `fail_count=0`, and a passing stored-pin
check. Capture the emitted new fingerprint:

Post-00700 candidate MD5: ___________________________

### 18. Execute C01–C06

Status: ______  Evidence reference: _______________________________________

C01 ___ C02 ___ C03 ___ C04 ___ C05 ___ C06 ___

For C01 use crystal chest `...401` and verify User A wallet `20→27`, exactly
one amount-only currency row, exactly one reward row and opened chest. C02 must
replay without another delta or row. C03 must deny User B against User A's
chest; C04 must deny anon. C05 repeats the exact `+7` and one-ledger-row proof.
Reset the fixture, then C06 must open Energy chest `...402`, move Energy
`100→130`, leave the crystal wallet unchanged and create one reward row.

STOP on any missing-column failure, unauthorized open, duplicate grant, changed
outcome on replay, incorrect delta, or unexpected fingerprint/security drift.

### 19. Execute W01–W03

Status: ______  Evidence reference: _______________________________________

W01 ___ W02 ___ W03 ___

STOP on negative wallet state, duplicate ledger credit, or direct client mutation.

### 20. Execute R01–R02

Status: ______  Evidence reference: _______________________________________

R01 ___ R02 ___

STOP unless both idempotency and duplicate-source constraints reject duplicates while preserving the original row.

### 21. Run postmigration audit

Status: ______  Evidence: _________________________________________________

Open and run: `supabase/audits/gamification/audit_praxe_gamification_patch_postmigration_readonly.sql`.

Expected: `fail_count=0`. Accepted warnings only:

- `legacy_toggle_runtime_debt`;
- `profiles_direct_write_transition`.

STOP on every other warning or any failure.

### 22. Confirm final audit gate

Status: ______  Reviewer initials: ______

Confirm `FAIL=0` and only the two allowed warnings. STOP otherwise.

### 23. Confirm intentional `open_user_chest` fingerprint transition

Status: ______

Reviewed old MD5: `e0e2b37869940e51cf02e3af0ae0ec23`

Focused-audit candidate MD5: ___________________________

Full postmigration-audit MD5: ___________________________

Expected: the two post-`00700` values are equal and differ from the reviewed old
MD5 and match the stored object pin. Review the candidate before any Production proposal. STOP on any
other drift.

### 24. STOP

Final disposable outcome: PASS / FAIL / BLOCKED

Blocking evidence: _________________________________________________________

Do not proceed to Production. A complete disposable pass only permits a separate
Production-readiness review. The reproduced crystal failure is addressed only
by the reviewed 00700 candidate and is not cleared until every post-00700 gate
passes and its new fingerprint is captured and reviewed.

## Global STOP conditions

- Wrong project/reference/host or any ambiguity about Production.
- Real/non-synthetic data or credentials observed.
- Baseline/fixture safety token missing.
- Existing-object collision in the supposedly empty project.
- Preflight or postmigration `FAIL>0`.
- Any undocumented warning.
- Any migration precondition/postcondition exception.
- Return-type mismatch while replacing the streak recorder.
- Unauthorized, cross-user, duplicate or partial reward behavior.
- Negative wallet/streak state or RLS regression.
- Any `open_user_chest` fingerprint other than the reviewed old value before
  00700 or the captured candidate value after 00700.
- Any post-00700 crystal-branch `balance_after` dependency or missing-column
  failure.
- Need to edit SQL interactively to “make the test pass.”

Exact next action after preparing this package: in the current disposable-v2, a
human performs Steps 14–24 manually, preserving only non-secret outputs. No
agent or automation should connect to Production for this procedure.
