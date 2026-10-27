# PRAXE meal quality and coherence V1

The meal-plan pipeline separates three authorities:

1. the nutrition target owns daily energy, macros and fibre;
2. the deterministic meal architecture owns meal roles, Brazilian archetypes, fuel level and allowed catalog pools;
3. the portion solver owns grams and may only adjust IDs already selected from those pools.

TACO remains the nutrient authority. The quality layer never rewrites energy or nutrients and never uses a staging UUID as a product rule. A food is identified by `source`, `sourceVersion` and `sourceFoodId`; the database UUID is only the persisted reference.

## Food suitability

`praxe-meal-coherence-validator-v1` derives a deterministic suitability profile from the TACO identity, canonical description, source food group and preparation state. The profile contains food form, PRAXE quality class, culinary roles, prepared state, meal suitability, training suitability and standalone suitability.

The PRAXE classes are product-generation classes, not an official NOVA classification:

- `CORE`: recognizable staple foods and prepared components;
- `SUPPORTING`: useful foods such as eggs, dairy, nuts and seeds;
- `OCCASIONAL`: sweets and dessert-like foods, excluded from automatic generation;
- `INGREDIENT_ONLY`: oils, flour, starches, powders and condiments that cannot appear as standalone foods;
- `EXCLUDE_FROM_AUTOGENERATION`: products that do not belong in the bounded automatic set.

An ingredient-only culinary fat can appear only through the explicit `FAT_ANCHOR` preparation slot. Sugar, sweets, achocolatado powder, culinary flour and mixes are not automatic carbohydrate anchors.

Castanha-do-Brasil (`TACO/4_edicao_2011/589`) remains unchanged in the catalog but is excluded from automatic generation. Its defining practical portion concern is a micronutrient that this engine does not model. This is a PRAXE product safety guardrail, not a calculated selenium recommendation, and it does not apply automatically to other nuts.

`PREPARED_COMPOSITE` identifies recipes such as macarrão à bolonhesa and cuscuz paulista. V1 keeps these entries out of generic automatic generation because their catalog row cannot be decomposed reliably into protein, starch and produce slots. A composite dish cannot masquerade as plain starch beside an extra protein anchor.

## Brazilian meal architecture

The server assigns one of six stable archetypes: breakfast, main meal, snack, pre-workout, post-workout and evening meal. Each archetype defines required culinary-role alternatives, optional supporting roles and a maximum item count. The AI receives only catalog IDs compatible with the role of that specific meal.

The default favors recognizable Brazilian combinations: fruit, eggs, dairy, grains or roots at breakfast and snacks; protein, rice or another starch, beans/legumes and vegetables in main meals; lower-fat carbohydrate plus protein around training. `LEGUME_ANCHOR` is distinct from `PRODUCE_FIBER`, so beans never satisfy the vegetable-produce slot. Fruit also does not substitute for vegetable produce in a main-style meal.

`LOW`, `MODERATE` and `HIGH` fuel levels change bounded carbohydrate portion bands. They do not authorize lower-quality foods. Hypertrophy, strength and conditioning can increase fuel around training while fat loss can reduce it.

## Validation and repair

Activation requires both the existing macro validator and `praxe-meal-coherence-validator-v1`. Hard failures include:

- standalone culinary ingredients;
- sweets as primary carbohydrate;
- powders or mixes as meal components;
- meal/archetype mismatch;
- missing produce in a main meal;
- a missing required meal-structure slot;
- a supporting item becoming the meal's largest energy contributor;
- a composite dish conflicting with a separate protein anchor;
- a fat-dense pre-workout;
- implausible portions;
- food outside the curated automatic set.

Daily repetition and variety are reported as warnings. When a day has at least two main-style meals, vegetable produce is required in each of them. Portion plausibility considers stable food identity, form, culinary role, meal role, energy contribution and any explicit safety guard; its bounds are product autogeneration guardrails, not clinical serving prescriptions. One controlled repair may swap an ID only within the server-provided pool for the same meal and slot. It cannot change the target, relax macro tolerances, introduce a new identity or turn a culinary ingredient into a standalone food.

## Human portion realism

Every approved food/slot pair receives a deterministic `FoodPortionProfile`: practical minimum, typical band, automatic-generation maximum, search increment, discrete-equivalent or continuous behavior, household-unit capability and refinement priority. These are PRAXE product guardrails for automatic generation; they are not universal clinical serving prescriptions.

Grams remain authoritative. Eggs and fruit snap to plausible gram equivalents, but the UI must not claim an egg, fruit or bread-unit conversion unless a curated catalog portion supplies it. Fruit and vegetable components are locked after snapping. Carbohydrate and protein anchors carry most meal energy and remain the primary refinement variables; legumes and tightly bounded culinary fat are secondary. Automatic culinary fat is capped at 20 g per meal. Fruit may not overtake the meal's carbohydrate anchor as a numeric macro patch, and a protein anchor below its practical role-specific floor fails coherence.

After the bounded solver, quantities are snapped to their profiles, nutrients are recalculated from TACO, and only flexible anchors may be refined. If those realistic quantities cannot satisfy the unchanged macro and coherence policies, generation fails closed instead of inflating fruit, produce, nuts or oil.

## Catalog audit boundary

`auditFoodSuitability` accounts for every entry in the snapshot supplied to it and reports counts by form and quality class plus examples. `auditPortionProfiles` similarly proves that every supplied PRAXE meal food receives a deterministic profile and reports coverage and unclassified counts. The repository stores a small official TACO regression fixture, not the full 595-row workbook. A full-catalog audit therefore requires passing the locally parsed official XLSX or a database snapshot to these pure functions; it does not require a write or import.
