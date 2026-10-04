# PRAXE database deployment policy

## Current Production model

Production database changes are manually reviewed and manually applied through the Supabase SQL Editor. The repository does not currently use Supabase CLI migration deployment, `db push`, or an application migration ledger.

`supabase/migrations/` is not an authoritative historical ledger for SQL that was previously applied manually. It contains only the repository's existing tracked onboarding history; no new gamification artifact in this release is placed there.

The current Production gamification state was verified read-only after manual application:

- `00500`, `00600`, and `00700` behavior is present;
- the final postmigration audit reported 8 PASS, the two documented transition warnings, and 0 FAIL;
- `open_user_chest(uuid)` has reviewed final fingerprint `c211e2c8734706c3ddbaf946c283aed4`;
- the currency ledger remains amount-only, `balance_after` is absent, and scoped RLS remains enabled.

The original files are preserved under `supabase/manual-history/gamification/`. They are evidence, not pending migrations. Do not reapply them. `00700` is one-shot by design.

The `00100`–`00400` files are non-authoritative planning artifacts under `supabase/planning/gamification/`. They must never be applied to Production.

Read-only manual audits live under `supabase/audits/gamification/`. Disposable database setup and fixture SQL lives under `supabase/tests/fixtures/gamification/` and must never be used against Production.

No migration-history relation for application changes was found in Production. Only Supabase-managed internal service ledgers were present. No migration ledger was created, no history row was inserted, and no migration repair was performed.

## Future policy

Do not adopt `supabase db push`, migration automation, or an external migration runner until a separately authorized baseline/reconciliation project defines the source of truth and proves its safety.

Before any future automated model is enabled:

1. inventory current Production schema and manually applied history read-only;
2. define which directory is discoverable by the chosen runner;
3. exclude planning, manual-history, audit, and test SQL from automatic application;
4. establish a reviewed baseline without rerunning historical SQL;
5. define creation, validation, deployment, and containment rules for genuinely new migrations.

Until that project is complete, future database changes require separate human review and explicit manual authorization. Merely committing or deploying application code never authorizes database SQL execution.
