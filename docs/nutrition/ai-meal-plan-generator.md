# PRAXE AI meal-plan generator V1

The V1 generator uses `praxe-meal-plan-generator-v1`, `praxe-meal-plan-validator-v1` and `praxe-meal-validation-policy-v1`.

The deterministic meal-structure engine owns the goal, active nutrition target, meal count, roles, windows and per-meal macro allocation. The server also prescribes food-role slots for each meal: `PROTEIN_ANCHOR`, `CARB_ANCHOR`, `PRODUCE_FIBER` and an optional `FAT_ANCHOR`. The AI only chooses a `catalogEntryId` allowed for each slot and proposes grams. It cannot define targets, nutrients, meal structure or food identities outside the bounded server set. The server discards undeclared fields through the strict Structured Outputs schema.

The runtime pipeline is:

```text
authoritative target → deterministic meal structure → server food-role slots
→ bounded TACO candidate pools → AI catalog-ID composition
→ deterministic effective TACO nutrients → deterministic portion solver
→ validator → one controlled repair within approved pools
→ recalibration → final validator → activation
```

The production path no longer uses `foodQuery` or alias resolution as food authority. Every selected ID is checked against its prescribed pool. Unknown IDs, wrong-pool substitutions and free text fail closed. Generation uses grams; household measures without an authoritative catalog conversion are rejected.

Candidate selection is deterministic and nutrition-led. Per-pool scoring uses effective protein density, carbohydrate contribution, fat density or fibre usefulness, with source group only as complementary evidence. Each pool contributes at most 24 ranked entries and the union remains bounded at 96. `TEST_ONLY`, non-TACO, inactive and wrong-version records never enter runtime generation.

The portion solver first performs deterministic single-item coordinate sweeps, then a bounded two-item joint search over the still-violated constraints. It optimizes calories, protein, carbohydrates, fat, fibre, hypertrophy meal protein distribution and meal-mass limits without changing IDs, targets or validation tolerances. An infeasible composition returns `PORTION_CALIBRATION_NO_FEASIBLE_SOLUTION`.

The daily validation policy centralizes calorie, protein, carbohydrate, fat and fiber tolerances. Goal checks add energy concentration, hypertrophy protein distribution and conditioning pre/post-training carbohydrate support. Disliked foods are hard failures. Preferred foods receive a positive score only after exact catalog resolution. Incomplete allergen or dietary metadata causes review before the AI call.

One controlled repair is allowed. It receives safe issue codes, numeric directions and only the approved candidates for the relevant pools. It may replace a food only with another approved ID in the same slot, and may adjust quantities, preparation notes and labels. Meal count, roles, windows, slots, target, goal, strategy and restrictions remain immutable. A validation failure stays retryable while the orchestrator still permits another attempt; exhausted attempts or a genuine eligibility/safety block require review. An invalid plan is never activated.

Activation is a service-role-only transaction. It serializes per user, reuses the target/strategy/generator identity, supersedes the previous active plan, preserves plan version and writes immutable food ID, source, source version, grams and calculated nutrient snapshots. Diagnostics expose only target/actual totals, deltas, directions, solver status, iterations, adjusted-item count and violated constraints. Prompts, raw provider responses, secrets and unnecessary personal data are not persisted.

The route is server-only at `/api/nutrition/meal-plans/generate`. It checks authentication/subscription, loads the active target and routine context, checks catalog readiness and eligibility before invoking OpenAI, and returns only safe status/issue codes. No Nutrition UI integration is included.
