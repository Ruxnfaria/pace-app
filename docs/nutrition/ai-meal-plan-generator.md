# PRAXE AI meal-plan generator V1

The V1 generator uses `praxe-meal-plan-generator-v1`, `praxe-meal-plan-validator-v1` and `praxe-meal-validation-policy-v1`.

The deterministic meal-structure engine owns the goal, active nutrition target, meal count, roles, windows and per-meal macro allocation. The AI receives only the nutrition/routine context needed to compose meals and returns structured JSON containing labels, exact catalog queries and candidate quantities. It cannot return authoritative nutrient totals. The server discards any undeclared fields through the strict Structured Outputs schema.

Every candidate item follows this pipeline:

```text
foodQuery → exact/curated-alias resolution → quantity-to-grams → TACO nutrients → meal totals → daily totals → validation
```

Unknown and ambiguous foods fail closed. There is no fuzzy automatic selection. `g`, `kg`, curated portions and `ml` with curated density are supported; household measures without a catalog conversion are rejected. Missing TACO nutrients remain unknown and prevent a complete plan.

The daily validation policy centralizes calorie, protein, carbohydrate, fat and fiber tolerances. Goal checks add energy concentration, hypertrophy protein distribution and conditioning pre/post-training carbohydrate support. Disliked foods are hard failures. Preferred foods receive a positive score only after exact catalog resolution. Incomplete allergen or dietary metadata causes review before the AI call.

One controlled repair is allowed. The repair receives safe issue codes and at most a small controlled set of catalog suggestions. It may change food candidates, quantities, preparation notes and labels. The unchanged server context continues to enforce target, goal, meal count, roles, windows, strategy and restrictions. A second invalid result becomes `requires_review` and is never activated.

Activation is a service-role-only transaction in the local unapplied migration. It serializes per user, reuses the target/strategy/generator identity, supersedes the previous active plan, preserves plan version and writes immutable food ID, source, source version, grams and calculated nutrient snapshots. Job-domain states map to the existing database vocabulary: `processing → generating`, `ready → succeeded`; retryable and review states keep their existing names. Safe error codes are stored, never prompts or full provider payloads.

The route is server-only at `/api/nutrition/meal-plans/generate`. It checks authentication/subscription, loads the active target and routine context, checks catalog readiness and eligibility before invoking OpenAI, and returns only safe status/issue codes. No Nutrition UI integration is included.
