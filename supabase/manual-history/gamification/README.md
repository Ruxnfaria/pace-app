# Gamification manual Production history

These SQL files were manually applied to Production and their final behavior was verified read-only. They are historical evidence, not pending migrations.

DO NOT REAPPLY. DO NOT RUN THROUGH SUPABASE CLI OR AUTOMATION.

| Original version | File | Production status |
| --- | --- | --- |
| `20261003000500` | `20261003000500_contain_legacy_mission_rpc.sql` | Already applied manually; legacy containment and successor verified |
| `20261003000600` | `20261003000600_reconcile_streak_sync.sql` | Already applied manually; corrected recorder verified |
| `20261003000700` | `20261003000700_reconcile_chest_currency_ledger.sql` | Already applied manually; `ONE_SHOT_BY_DESIGN`; final fingerprint `c211e2c8734706c3ddbaf946c283aed4` |

The original filenames and SQL bytes are preserved. No application migration ledger was created or repaired.
