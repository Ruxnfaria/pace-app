import type { FoodCoverageCategory } from "../domain";

export const TACO_SOURCE = "TACO" as const;
export const TACO_SOURCE_VERSION = "4_edicao_2011" as const;
export const PRAXE_TACO_CATALOG_VERSION = "praxe-food-catalog-taco-v1" as const;
export const TACO_WORKSHEET = "CMVCol taco3" as const;
export const TACO_EXPECTED_SOURCE_FILE = "taco_4_edicao_ampliada_e_revisada.xlsx" as const;
export const TACO_PUBLICATION = "Tabela Brasileira de Composição de Alimentos — TACO" as const;
export const TACO_EDITION = "4ª edição revisada e ampliada" as const;
export const TACO_ATTRIBUTION = "NEPA/UNICAMP, 2011" as const;
export const TACO_SOURCE_REFERENCE =
  "Tabela Brasileira de Composição de Alimentos — TACO, 4ª edição revisada e ampliada, NEPA/UNICAMP, 2011" as const;
export const TACO_OFFICIAL_XLSX_URL = "https://nepa.unicamp.br/publicacoes/tabela-taco-excel/" as const;
export const TACO_OFFICIAL_PDF_URL = "https://nepa.unicamp.br/publicacoes/tabela-taco-pdf/" as const;

export const TACO_READINESS_REQUIRED_CATEGORIES: readonly FoodCoverageCategory[] = [
  "cereals", "legumes", "meats", "poultry", "fish", "eggs", "dairy",
  "fruits", "vegetables", "roots_tubers", "breads", "pasta", "oils_fats",
  "nuts_seeds", "vegetarian_staples",
] as const;

// Availability across the five V1 fields. This measures known cells rather
// than requiring fiber for every animal food, where TACO commonly marks it NA.
export const TACO_CORE_NUTRIENT_COVERAGE_MINIMUM = 0.85;
export const TACO_ENERGY_WARNING_ABSOLUTE_KCAL = 50;
export const TACO_ENERGY_WARNING_RELATIVE = 0.2;
