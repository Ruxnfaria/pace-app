# PRAXE Gamification — Phase A.3 Disposable Validation Package

Status: prepared only for a disposable/test Supabase database. No SQL in this package has been executed.

## Non-negotiable environment requirement

An empty Supabase project is not a valid baseline. Both patches are forward-only deltas over the already deployed PRAXE schema and functions. The test database must reproduce the Production-like schema state reported by `supabase/audits/gamification/audit_praxe_gamification_existing_state_readonly.sql` before either patch is applied.

Use no real user rows, email addresses, tokens, secrets, health data, nutrition data, workout data, or other Production data. The fixture uses two reserved `.invalid` synthetic identities and deterministic test-only object identifiers.

## Patch dependency map

### A. Required before `00500`

| Kind | Required contract | Why |
|---|---|---|
| Roles | `anon`, `authenticated`, `service_role`, plus PostgreSQL `PUBLIC` | Explicit grants and revokes |
| Auth function | `auth.uid()` | Successor binds ownership to the JWT identity |
| Legacy RPC | `public.toggle_mission_with_xp(uuid,boolean)` with trusted owner | The patch contains rather than drops the active Dashboard dependency |
| Streak RPC | `public.record_user_streak_activity(uuid)` | Called inside the successor transaction |
| Table | `public.daily_missions` | Mission ownership/state |
| Columns | `id uuid`, `user_id uuid`, `completed boolean`, `xp_reward` integer-compatible, `current_value` integer-compatible, `target_value` integer-compatible, `completed_at` timestamp-compatible | Read/lock/completion update |
| Index/constraint | Unique or primary lookup for `daily_missions.id` | Deterministic row lock and update |
| Table | `public.profiles` | Energy and level update |
| Columns | `user_id uuid`, `total_xp` integer-compatible, `level` integer-compatible | Atomic reward application |
| Index/constraint | Unique or primary lookup for `profiles.user_id` | Exactly one owned profile |
| Table | `public.reward_transactions` | Durable reward record |
| Columns | `user_id`, `reward_type`, `source_type`, `source_id`, `idempotency_key`, `payload` | Successor insert contract |
| Constraint | Unique `(user_id, idempotency_key)` | Exact-once replay defense |
| Constraint/index | Unique source/reward identity when `source_id` is present | Additional duplicate-source defense expected by the audits |
| Ownership/RLS | RLS enabled on `profiles`, `daily_missions`, `reward_transactions`; existing own-row policies intact | Client isolation and legacy compatibility |
| Function ownership | Legacy function owner must not be `anon`, `authenticated`, or `service_role` | Prevent untrusted definer ownership |

The database must also provide the trusted `plpgsql` language and ordinary PostgreSQL built-ins used by the functions (`greatest`, `coalesce`, `floor`, `now`, JSONB construction and row locking). No new extension is required by either patch.

The legacy RPC should exhibit authentication/ownership and row-lock signals. If preflight cannot verify them, stop even though `00500` does not replace its body.

### B. Required before `00600`

| Kind | Required contract | Why |
|---|---|---|
| Roles | `anon`, `authenticated`, `service_role`, `PUBLIC` | Service-only ACL enforcement |
| Function | Exact signature `public.record_user_streak_activity(uuid)` with the deployed table return contract | `CREATE OR REPLACE` must preserve callers and return type |
| Table | `public.profiles` | Legacy compatibility state |
| Columns | `user_id`, `streak`, `last_activity_date` | Lock, seed and synchronization |
| Table | `public.user_streaks` | Dedicated streak state |
| Columns | `user_id`, `current_streak`, `longest_streak`, `last_active_date` | State machine and result |
| Index/constraint | Primary/unique `user_streaks(user_id)` | `ON CONFLICT (user_id)` and one row per user |
| Defaults | Any required omitted columns such as `created_at`/`updated_at` must have defaults | Safe seed insert |
| RLS/policy | RLS enabled; authenticated own-row read policy retained | Read compatibility; writes stay service-controlled |
| Function ownership | Recorder owner must not be a client/service JWT role | Trusted definer contract |

### C. Optional to patch execution but required by regression validation

- `user_wallets`, `currency_transactions`, `user_chests`, `chest_definitions`, `loot_tables`, `loot_table_entries`, `items`, and `user_inventory` with their reported Production-like constraints.
- `open_user_chest(uuid)`, `grant_user_chest(...)`, and chest immutability/update triggers.
- `get_my_streak()`; neither patch calls or replaces it.
- Updated-at triggers on wallet/catalog/streak tables. They are desirable but not required by the two function definitions.
- Existing chest/catalog policies. They are required for the complete regression matrix, not for compiling the three patches.

Policy/trigger expectations are explicit even though the security-definer patch bodies do not depend on policy names:

- `profiles`: RLS plus the existing own-profile read/update behavior needed by the legacy Dashboard during transition;
- `daily_missions`: RLS plus own-user select/write behavior needed by the existing runtime;
- `reward_transactions`, `user_wallets`, `currency_transactions`, `user_chests`, and `user_streaks`: authenticated own-row read policies and no direct client mutation path;
- catalogs (`chest_definitions`, `loot_tables`, `loot_table_entries`): authenticated active-row read policies;
- `user_chests_prevent_reversion`: required for the chest immutability regression;
- `user_streaks_set_updated_at` and catalog/wallet updated-at triggers: expected compatibility helpers but not compile-time requirements for `00500`/`00600`.

### D. Created or replaced

`00500`:

- revokes legacy `toggle_mission_with_xp(uuid,boolean)` execution from `PUBLIC` and `anon`;
- retains its authenticated grant temporarily;
- creates/replaces `complete_mission_with_energy(uuid)`;
- grants the successor to `authenticated` and `service_role` only.

`00600`:

- replaces `record_user_streak_activity(uuid)` without changing its signature or returned columns;
- changes its behavior to synchronize `user_streaks` and `profiles` atomically;
- enforces service-only execution.

Neither patch creates tables, indexes, policies, triggers, users, wallets, catalogs, or chest state.

## Disposable environment options

| Option | Requirement | Advantage | Risk/limitation | Production-like fidelity |
|---|---|---|---|---|
| A — Supabase database branch | Branching must be available and confirmed isolated in the account | Closest schema/function/extensions behavior; convenient disposal | A data-copying branch may contain real data; do not use it unless data is excluded or sanitized and access is tightly isolated | Highest when created from the correct schema revision; reject if it necessarily copies unsanitized Production data |
| B — temporary Supabase project | New project plus a schema-only, Production-compatible baseline | Strong isolation, real Supabase roles/Auth/RLS behavior, no need for Production data | Schema reconstruction can drift; every preflight requirement must be verified | Recommended practical option when populated from schema only and verified by preflight |
| C — future local environment | Supabase CLI and Docker installed and the Production-like baseline reproducible locally | Fast reset, offline repeatability, safe concurrency testing | Not currently available; local extension/Auth behavior must match hosted Supabase | Good after parity is demonstrated; not usable on the present host |

Preferred order: A only if it can be isolated without real data; otherwise B. C becomes preferable for repeated engineering tests once the tooling exists.

## Minimal synthetic fixture

File: `supabase/tests/fixtures/gamification/test_praxe_gamification_disposable_fixture.sql`.

It is deliberately not a migration. It requires:

1. two confirmed synthetic Auth users created through the disposable project's normal Auth administration:
   - `user_a@praxe.invalid`
   - `user_b@praxe.invalid`
2. normal application/bootstrap creation of the corresponding `profiles` rows;
3. the Production-like schema/catalogs already present;
4. an explicit temporary-table safety gate created in the same SQL session, exactly as documented at the top of the fixture.

It creates or resets only synthetic state:

- user A: 100 Energy, legacy streak 2, dedicated streak 2/longest 4/yesterday, wallet 20;
- user B: 75 Energy, streak 0, wallet 5, no dedicated streak row;
- one incomplete A mission worth 50 Energy;
- one completed A mission worth 25 Energy;
- one incomplete B mission worth 40 Energy;
- one unrelated baseline reward transaction;
- deterministic crystal-only and Energy-only test chest definitions/loot;
- two granted chests owned by A.

The fixture is scoped to these synthetic identities and deterministic A.3 keys. It must never be run against Production.

## Exact execution order and stop rules

### Step 1 — establish and prove the disposable baseline

1. Confirm project reference/database host is not the Production project.
2. Confirm no Production connection string or service key is loaded.
3. Confirm the schema is Production-compatible, not empty.
4. Create the two synthetic Auth users and bootstrap their profiles.
5. In one disposable SQL session, create the required temporary confirmation table/token, then run the fixture file.
6. Record the project reference, operator, timestamp, and `open_user_chest` preflight fingerprint in the validation evidence.

Stop if the environment identity is ambiguous, either test user/profile is absent, the fixture safety gate fails, or any non-synthetic data is present unexpectedly.

### Step 2 — run patch preflight

Run `supabase/audits/gamification/audit_praxe_gamification_patch_preflight_readonly.sql`.

Required result: `fail_count = 0`.

Expected pre-patch warnings:

- `legacy_toggle_containment_precondition`: `PUBLIC`/`anon` exposure being fixed by `00500`;
- `streak_recorder_precondition`: legacy recorder does not yet synchronize `profiles.streak`;
- `profiles_legacy_client_writes`: documented runtime compatibility debt.

No other warning is automatically accepted. Investigate any extra warning. Stop on every `FAIL`.

### Step 3 — apply `00500`

Run only `supabase/manual-history/gamification/20261003000500_contain_legacy_mission_rpc.sql`. It is transactional. Stop if it raises any precondition or postcondition exception.

### Step 4 — validate `00500`

First run `supabase/audits/gamification/audit_praxe_gamification_00500_smoke_readonly.sql`; it must return `overall_status=PASS` and `fail_count=0`. Then run M01–M07 below. For authenticated SQL-editor testing, use a transaction that sets `role authenticated` and sets `request.jwt.claim.sub` to the synthetic user UUID before invoking the RPC. Prefer two genuinely separate database sessions for M03. Reset the disposable fixture between scenarios that consume the same mission.

Stop on unauthorized access, cross-user access, duplicate Energy/reward, a partial write, or loss of legacy authenticated execution.

Disposable SQL-editor identity harness template (replace only with UUIDs printed by the synthetic fixture):

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '<SYNTHETIC_USER_A_UUID>', true);
select *
from public.complete_mission_with_energy(
  'a3000000-0000-4000-8000-000000000001'::uuid
);
commit;
```

For an anonymous denial test, use `set local role anon`, clear the claim with `set_config('request.jwt.claim.sub', '', true)`, invoke the target RPC, and roll back. For recorder state tests, use `set local role service_role` and pass only a fixture-produced UUID. If the hosted SQL editor does not permit safe role switching, use separate disposable Auth sessions through the Supabase API instead; never substitute the SQL-editor owner call as proof of client ACL behavior. Do not record JWTs or service keys in test evidence.

For M03, use two independent connections with the same synthetic authenticated claim. Start both transactions, invoke the same incomplete mission, allow one to commit, then observe the second resume. A single SQL editor transaction cannot prove lock contention.

### Step 5 — apply `00600`

Run only `supabase/manual-history/gamification/20261003000600_reconcile_streak_sync.sql`. Stop on any precondition or postcondition exception.

### Step 6 — validate streak behavior

Run S01–S07. The recorder is service-only: state-machine tests must run through a trusted disposable service context, while authenticated/anonymous calls must be rejected. Manipulating dates to simulate next day/gap is allowed only for the two synthetic users in this disposable database.

### Step 7 — regress chests and wallets

Before `00700`, reset the fixture and run
`supabase/audits/gamification/audit_praxe_gamification_00700_chest_reconciliation_readonly.sql`. It must
report `PRE_00700`, the old fingerprint
`e0e2b37869940e51cf02e3af0ae0ec23`, and zero failures. Apply
`supabase/manual-history/gamification/20261003000700_reconcile_chest_currency_ledger.sql` exactly once, then rerun
  the audit. It must report `POST_00700_CANDIDATE`, zero failures and a passing
  stored-pin check. Record the new fingerprint for review before Production.

The pre-`00700` deterministic C01 already reproduced `ERROR 42703` because the
old function wrote absent `currency_transactions.balance_after`; its prior
wallet mutation rolled back. After `00700`, reset the fixture again and run
C01–C06, W01–W03, and R01–R02 against the amount-only ledger implementation.
Any missing-column error, duplicate reward, balance mismatch, access-control
failure or unrelated fingerprint drift remains a STOP.

### Step 8 — run postmigration audit

Run `supabase/audits/gamification/audit_praxe_gamification_patch_postmigration_readonly.sql`.

Required result: `fail_count = 0`.

Only these warnings are accepted:

- `legacy_toggle_runtime_debt`;
- `profiles_direct_write_transition`.

The post-`00700` `open_user_chest` fingerprint must differ from
`e0e2b37869940e51cf02e3af0ae0ec23`, equal the candidate emitted by the focused
00700 audit and the stored object pin, and be explicitly reviewed before Production. MD5 here is only an
equality marker, not a security proof.

## Test matrix

### Missions and Energy

| ID | Scenario | Setup | Action | Expected DB result | Expected API/RPC result | Security expectation | PASS criteria |
|---|---|---|---|---|---|---|---|
| M01 | Mission completion | Reset fixture; authenticate as A; mission `...001` incomplete; Energy 100 | Call successor with `...001` | Mission completed/current target reached; Energy 150; one reward row; no partial state | One row: `completed_now=true`, `energy_awarded=50`, `total_energy=150` | Caller acts only as JWT user A | All four writes commit atomically |
| M02 | Repeated completion | M01 already committed | Call successor again as A | No balance or ledger change | `completed_now=false`, award 0, total 150 | Replay cannot claim again | Reward count remains exactly one |
| M03 | Concurrent completion | Reset fixture; two independent A sessions begin before completion | Both call successor for `...001`; coordinate commits | One transition, one +50, one reward | One true/50 result and one false/0 result after lock release | Row lock serializes claim | Final Energy 150 and one reward only |
| M04 | Other-user mission | Authenticate as A; target B mission `...003` | Call successor | No rows change | `Mission not found` | No cross-user existence leak beyond generic not-found | B mission/Energy/rewards unchanged |
| M05 | Anonymous mission call | Clear JWT; use `anon` | Call legacy and successor | No rows change | Permission/authentication rejection | Neither function executable anonymously | Both denied |
| M06 | PUBLIC privilege | Patch applied | Inspect `pg_proc` ACL with `aclexplode`; do not invoke | No mutation | `PUBLIC=false`, `anon=false` for both; legacy authenticated=true | No implicit PUBLIC path | Catalog result matches exactly |
| M07 | Energy exact-once | Reset fixture, capture profile/reward counts | Run M01 then M02 | Net Energy exactly +50; exactly one deterministic idempotency key | First success, replay no-op | Cannot supply reward amount/user id | Delta and row count exact |

### Streaks

| ID | Scenario | Setup | Action | Expected DB result | Expected API/RPC result | Security expectation | PASS criteria |
|---|---|---|---|---|---|---|---|
| S01 | First streak event | Reset fixture; B has no `user_streaks` row and legacy streak 0 | Service calls recorder for B | Dedicated row current/longest 1; profile streak 1; both dates today Brazil | Returns B, current/effective/longest 1 | Only trusted service can target UUID | Both representations equal 1 |
| S02 | Same-day replay | S01 committed | Service calls again same Brazil day | No increment; dates stable | Returns 1 again | Idempotent same-day call | Current/longest unchanged |
| S03 | Next-day streak | Synthetic row/profile set to yesterday with current 2, longest 4 | Service calls recorder | Current 3, longest remains 4, date today; profile 3 | Returns current/effective 3, longest 4 | Service only | Correct consecutive transition |
| S04 | Gap reset | Synthetic row/profile date set to at least two days ago, current 5, longest 5 | Service calls recorder | Current 1, longest 5, date today; profile 1 | Returns 1/1/5 | Service only | Gap does not erase longest |
| S05 | Longest streak | Set yesterday current/longest 4 | Service calls recorder | Current and longest become 5 | Returns 5/5/5 | Service only | Longest advances exactly once |
| S06 | Legacy sync | Any successful S test | Compare `profiles` and `user_streaks` | `profiles.streak=current_streak`; dates agree | Returned effective equals dedicated current | No client write used | Equality holds transactionally |
| S07 | Wrong-user/client attempt | Authenticate as A and pass B UUID; repeat as anon | Call recorder | No rows change | Permission denied before execution | Recorder is not an end-user RPC | Both client roles denied; service test remains allowed |

### Chests, wallet and rewards

| ID | Scenario | Setup | Action | Expected DB result | Expected API/RPC result | Security expectation | PASS criteria |
|---|---|---|---|---|---|---|---|
| C01 | Chest open | Reset fixture; authenticate A; crystal chest `...401` granted | Call frozen `open_user_chest` | Chest opened; +7 crystals; one currency and reward row | Returns crystal reward amount 7 | Ownership derived from JWT | Atomic open and grant |
| C02 | Chest replay | C01 committed | Call same chest again | No additional balance/ledger/reward change | Returns persisted identical reward | Replay is idempotent | Counts and wallet unchanged |
| C03 | Other-user chest | Authenticate as B; target A chest | Call frozen RPC | No rows change | Generic chest-not-found | No cross-user open | A chest remains granted/unmodified |
| C04 | Anonymous chest call | Use anon/no JWT | Call frozen RPC | No rows change | Denied | Anonymous execution absent | Permission/auth failure only |
| C05 | Crystal reward | Crystal-only synthetic chest after `00700` | Open as A | Wallet 20→27; nonnegative balance; one amount-only currency row | `reward_type=crystals`, amount 7 | Controlled function only | Exact +7 and one ledger/reward row; no `balance_after` dependency |
| C06 | Energy reward | Reset fixture; Energy chest `...402`; A Energy 100 | Open as A | Energy 100→130; one reward row; wallet unchanged | `reward_type=energy`, amount 30 | Controlled function only | Exact +30, replay unchanged |
| W01 | Wallet nonnegative | A wallet exists | Attempt trusted synthetic debit/update below zero inside a rollback test | Check constraint rejects negative result | Constraint error | Client direct write also remains denied | Wallet unchanged/nonnegative |
| W02 | Ledger idempotency | Complete C01 then replay | Compare currency rows by idempotency key | Exactly one currency transaction | Replay returns persisted result | No duplicate credit | Count exactly one |
| W03 | Unauthorized wallet write | Authenticate as A and B; attempt direct wallet update | No wallet changes | RLS/privilege denial | Wallet writes are controlled | Both direct writes denied |
| R01 | Reward uniqueness | M01 or C01 committed | Attempt same `(user_id,idempotency_key)` in rollback test | Unique violation; original preserved | Error | Duplicate reward rejected | Count remains one |
| R02 | Duplicate source reward | Existing synthetic source reward | Attempt same user/type/source/source_id in rollback test | Unique partial index rejects duplicate | Error | Alternate key cannot bypass idempotency | Count remains one |

## Rerun safety

M01 incident note: the reconstructed pre-`00600` recorder originally used `ON CONFLICT (user_id)` while `user_id` was also an OUT parameter created by `RETURNS TABLE`. The baseline artifact now targets `user_streaks_pkey` explicitly. This incident does not establish a Production defect. The same ambiguous pattern was found and explicitly corrected in `00600`; that migration now validates the named single-column primary key before replacement. The old disposable remains invalid validation evidence and must be discarded. Restart from a new disposable at Step 1.

| Patch | Classification | Reason |
|---|---|---|
| `00500` | `SAFE_WITH_PRECONDITIONS` | Revokes/grants are repeatable and successor uses `CREATE OR REPLACE`; it writes no application data. It still requires the trusted legacy RPC, required tables/columns, recorder and roles on every run. Never treat it as safe on an arbitrary/empty database. |
| `00600` | `SAFE_WITH_PRECONDITIONS` | Same signature is replaced deterministically and grants are reasserted; it writes no application rows until invoked. Exact existing signature/return contract, trusted owner, columns, unique streak key, defaults and roles must remain valid. |
| `00700` | `SAFE_WITH_PRECONDITIONS` | Replaces only the reviewed old `open_user_chest(uuid)` body after verifying its exact old fingerprint, amount-only ledger, dependencies, return contract, owner, ACL and security configuration. It derives and stores the new fingerprint, which must be captured and reviewed before Production. |

For the rerun test, apply `00500` twice and `00600` twice only in the disposable database, then rerun the postmigration audit and a focused M01/M02 plus S01/S02 check. A rerun must not create objects with alternate signatures or broaden grants.

## Production readiness gate

All conditions are mandatory:

- disposable preflight `FAIL=0`, with only documented warnings;
- `00500` commits successfully and passes its postconditions;
- `00600` commits successfully and passes its postconditions;
- `00700` commits successfully and passes its postconditions;
- every M/S/C/W/R test passes;
- postmigration audit `FAIL=0`, with only the two documented transition warnings;
- post-00700 `open_user_chest` fingerprint differs from the reviewed old value,
  matches across the focused/full audits and stored object pin, and is reviewed before Production;
- crystal and Energy chest branches both proven;
- no RLS regression or client privilege escalation;
- no duplicate reward, ledger or current-mission rows;
- no negative wallet or streak state;
- legacy Dashboard authenticated RPC compatibility explicitly smoke-tested;
- patch reruns pass under their stated preconditions;
- evidence contains exact outputs without secrets;
- runtime containment and later ACL-cutover plans are approved.

Any unmet item is a stop. Disposable success authorizes a Production review, not Production execution.

## Containment, not destructive rollback

If database patches validate but the current UI fails:

1. do not route runtime to the new successor; the present Dashboard remains on the legacy authenticated RPC;
2. verify the legacy authenticated grant. If it was unexpectedly absent, a narrowly reviewed `GRANT EXECUTE ON FUNCTION public.toggle_mission_with_xp(uuid,boolean) TO authenticated` is the only compatibility re-grant to consider;
3. if the unused successor itself is suspect, contain it by revoking its authenticated execution in a reviewed forward patch rather than dropping tables/functions or deleting rewards;
4. stop any future service caller of the streak recorder if compatibility results differ, preserving all `user_streaks` and profile data for diagnosis;
5. do not reset, delete, or rewrite rewards, chest openings, wallets, or ledger history. Those records represent committed economic/idempotency state;
6. restore behavior only through a reviewed forward patch or a vetted prior function definition, with new preflight/post-audit evidence.

No destructive rollback SQL is included in this package.

## Exact next human action

Continue only in the isolated disposable-v2: reset the fixture, run the focused
00700 preflight, apply 00700 once, rerun its audit, capture the new fingerprint,
then execute C01–C06, W01–W03, R01–R02 and the full postmigration audit exactly.
Stop on any failure, undocumented warning, patch exception, remaining
`balance_after` dependency, security regression or fingerprint drift.

Phase B runtime/UI work remains prohibited until the complete disposable gate passes.
