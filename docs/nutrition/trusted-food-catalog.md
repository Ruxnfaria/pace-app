# PRAXE trusted food catalog

The catalog is the only nutrition authority allowed for future meal-plan generation and validation. AI estimates, including the separate `/api/nutrition/analyze` feature, are never authoritative inputs.

## V1 authority and attribution

`source=TACO` and `source_version=4_edicao_2011` identify the V1 dataset. The PRAXE transformation contract is independently versioned as `praxe-food-catalog-taco-v1`.

> Tabela Brasileira de Composição de Alimentos — TACO, 4ª edição revisada e ampliada, Núcleo de Estudos e Pesquisas em Alimentação (NEPA), Universidade Estadual de Campinas (UNICAMP), 2011.

The official publication permits total or partial reproduction when the source is cited. Official distribution links:

- XLSX: https://nepa.unicamp.br/publicacoes/tabela-taco-excel/
- publication/PDF: https://nepa.unicamp.br/publicacoes/tabela-taco-pdf/

The source workbook is not committed. This avoids carrying a large binary while keeping acquisition reproducible from NEPA/UNICAMP. Expected local input:

```text
EXPECTED_SOURCE_FILE=taco_4_edicao_ampliada_e_revisada.xlsx
SOURCE_PUBLICATION=Tabela Brasileira de Composição de Alimentos — TACO
SOURCE_EDITION=4ª edição revisada e ampliada
SOURCE_ATTRIBUTION=NEPA/UNICAMP, 2011
```

## Offline import

The deterministic parser reads `CMVCol taco3` from the official XLSX. It preserves the official food number as `source_food_id`, the full description as the canonical name, preparation terms, source group, moisture, official energy, protein, lipids, carbohydrate and fiber. Search normalization removes case, diacritic and controlled punctuation differences without deleting words such as `cru`, `cozido`, `grelhado`, `integral`, `desnatado` or `com gordura`.

Run the database importer only after a separately authorized migration and environment change:

```powershell
$env:TACO_SOURCE_FILE = 'C:\local\taco_4_edicao_ampliada_e_revisada.xlsx'
$env:SUPABASE_URL = 'https://<authorized-project-ref>.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = '<server-only-key>'
$env:TACO_TARGET_PROJECT_REF = '<authorized-project-ref>'
npm run import:taco
```

The script is server/offline only. It requires an explicit local source path and server credential, verifies that the Supabase URL matches the separately supplied target project ref, parses and validates the entire workbook before writing, enforces the base-readiness gate, blocks an active different TACO version, and upserts batches on `(source, source_food_id, source_version)`. Re-running the same edition is idempotent. It never silently replaces another source version. No import is run as part of build, deploy or application startup.

## Null and trace policy

The source legend defines `NA` as not applicable, `Tr` as trace, `*` as analyses under reevaluation and blank cells as analyses not requested. TACO uses trace for rounded values below its stated display thresholds or values below quantification limits. The parser therefore records all four cases as `null` plus a distinct marker in `source_metadata.valueMarkers`. It never turns them into zero. Numeric zero is retained only when the official cell is numeric zero.

Official TACO kcal remain the authoritative energy value. The parser also calculates `macroDerivedEnergyKcal` from protein/carbohydrate/fat and emits an `ENERGY_DISCREPANCY` warning above the versioned absolute/relative policy. It never overwrites official kcal.

Rows with missing values may remain partial. Negative, non-finite or physiologically impossible V1 values are rejected. The import report records total/accepted/rejected rows, warnings, missing counts and duplicate source IDs.

## Safety and readiness

TACO is not a complete allergen or dietary-pattern database. Every TACO V1 row defaults to `allergen_data_complete=false`, empty allergen tags and empty dietary tags. Names are not used to assert allergy safety, vegetarian status or vegan status. Automatic generation fails closed when a user needs missing restriction metadata.

Readiness has four levels:

- `CATALOG_NOT_AVAILABLE`: no active records.
- `CATALOG_DEVELOPMENT_ONLY`: fixtures, unrecognized versions, invalid provenance, insufficient nutrient availability or category gaps.
- `CATALOG_BASE_NUTRITION_READY`: recognized authoritative production data, exact provenance, at least one food in each V1 category and at least 85% availability across the five core nutrient cells.
- `CATALOG_RESTRICTION_SAFE`: base-ready plus explicit complete restriction/allergen metadata for every authoritative entry.

The category report uses source groups and conservative name classification for coverage measurement only. These classifications do not create dietary or allergen claims. TACO alone can reach base-nutrition readiness and cannot reach restriction-safe readiness without separate approved curation.

Portions remain empty because the selected official worksheet does not provide safe household-measure conversions. Future meal plans must use grams until an authoritative portion source is approved. The only V1 aliases are a small curated list that preserves preparation state; broad ambiguous aliases are excluded.

TBCA remains reserved for a future integration after its commercial-use and redistribution terms are explicitly authorized. This tranche performs no TBCA scraping or import.
