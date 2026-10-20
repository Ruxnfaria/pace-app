import { Workbook } from "exceljs";
import type { FoodCoverageCategory, NutrientsPer100g } from "../domain";
import { importNutritionCatalog, type NutritionCatalogImportRecord } from "../importer";
import {
  PRAXE_TACO_CATALOG_VERSION,
  TACO_ENERGY_WARNING_ABSOLUTE_KCAL,
  TACO_ENERGY_WARNING_RELATIVE,
  TACO_SOURCE_REFERENCE,
  TACO_SOURCE_VERSION,
  TACO_WORKSHEET,
} from "./constants";

export type TacoCellMarker = "TRACE" | "NOT_APPLICABLE" | "NOT_REEVALUATED" | "NOT_REQUESTED";

export interface TacoNutrientCell {
  value: number | null;
  marker: TacoCellMarker | null;
}

export interface TacoImportReport {
  source: "TACO";
  sourceVersion: typeof TACO_SOURCE_VERSION;
  catalogVersion: typeof PRAXE_TACO_CATALOG_VERSION;
  totalRows: number;
  accepted: number;
  rejected: number;
  warnings: string[];
  missingEnergy: number;
  missingProtein: number;
  missingCarbs: number;
  missingFat: number;
  missingFiber: number;
  duplicateSourceIds: string[];
}

export interface TacoParseResult {
  records: NutritionCatalogImportRecord[];
  report: TacoImportReport;
}

export const NUTRIENT_ZERO_EPSILON_POLICY_VERSION = "NUTRIENT_ZERO_EPSILON_V1" as const;
// TACO reports carbohydrate by difference and formats this column to one
// decimal place. Half of that reporting increment is the narrowest justified
// tolerance for a negative residual that displays as zero.
export const NUTRIENT_ZERO_EPSILON = 0.05;

export interface NearZeroNutrientNormalization {
  nutrient: "carbsG";
  rawSourceValue: number;
  normalizedValue: 0;
  policyVersion: typeof NUTRIENT_ZERO_EPSILON_POLICY_VERSION;
}

export function normalizeNearZeroNegativeCarbohydrate(
  value: number | null,
): { value: number | null; normalization: NearZeroNutrientNormalization | null } {
  if (value !== null && value < 0 && value >= -NUTRIENT_ZERO_EPSILON) {
    return {
      value: 0,
      normalization: {
        nutrient: "carbsG",
        rawSourceValue: value,
        normalizedValue: 0,
        policyVersion: NUTRIENT_ZERO_EPSILON_POLICY_VERSION,
      },
    };
  }
  return { value, normalization: null };
}

const PAGE_HEADERS = new Set(["número do", "numero do", "alimento", "legenda"]);

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "result" in value && typeof value.result === "string") return value.result.trim();
  if (value && typeof value === "object" && "text" in value && typeof value.text === "string") return value.text.trim();
  return "";
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "result" in value && typeof value.result === "number" && Number.isFinite(value.result)) {
    return value.result;
  }
  const text = textValue(value);
  if (!text) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

export function parseTacoNutrientCell(value: unknown): TacoNutrientCell {
  const directNumber = numericValue(value);
  if (directNumber !== null) return { value: directNumber, marker: null };
  const text = textValue(value);
  if (!text) return { value: null, marker: "NOT_REQUESTED" };
  if (/^tr\.?$/iu.test(text)) return { value: null, marker: "TRACE" };
  if (/^na$/iu.test(text)) return { value: null, marker: "NOT_APPLICABLE" };
  if (text === "*") return { value: null, marker: "NOT_REEVALUATED" };
  const numeric = Number(text.replace(",", "."));
  return Number.isFinite(numeric) ? { value: numeric, marker: null } : { value: null, marker: "NOT_REQUESTED" };
}

export function derivePreparationState(canonicalName: string): string {
  const value = canonicalName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const states: Array<[RegExp, string]> = [
    [/\bcru[ao]?\b/, "raw"], [/\bcozid[ao]\b/, "cooked"], [/\bgrelhad[ao]\b/, "grilled"],
    [/\bassad[ao]\b/, "roasted"], [/\bfrit[ao]\b/, "fried"], [/\brefogad[ao]\b/, "sauteed"],
    [/\bdesidratad[ao]\b|\bpo\b/, "dried"], [/\bconserva\b|\benlatad[ao]\b/, "preserved"],
  ];
  return states.find(([pattern]) => pattern.test(value))?.[1] ?? "as_described";
}

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function classifyTacoCoverage(foodGroup: string, canonicalName: string): FoodCoverageCategory[] {
  const group = normalized(foodGroup);
  const name = normalized(canonicalName);
  const result = new Set<FoodCoverageCategory>();
  if (group.includes("cereais")) result.add("cereals");
  if (group.includes("leguminosas")) result.add("legumes");
  if (group.includes("carnes")) result.add(name.includes("frango") || name.includes("peru") ? "poultry" : "meats");
  if (group.includes("pescados")) result.add("fish");
  if (group.includes("ovos")) result.add("eggs");
  if (group.includes("leite")) result.add("dairy");
  if (group.includes("frutas")) result.add("fruits");
  if (group.includes("verduras")) result.add("vegetables");
  if (group.includes("gorduras")) result.add("oils_fats");
  if (group.includes("nozes")) result.add("nuts_seeds");
  if (/\bpao\b|torrada/.test(name)) result.add("breads");
  if (/macarrao|massa,|nhoque/.test(name)) result.add("pasta");
  if (/mandioca|aipim|batata|inhame|cara,|cará,/.test(name)) result.add("roots_tubers");
  if (/tofu|soja|feijao|lentilha|grao-de-bico|tremoco/.test(name)) result.add("vegetarian_staples");
  return [...result];
}

function primaryFoodGroup(categories: readonly FoodCoverageCategory[], sourceGroup: string): string {
  return categories[0] ?? `taco:${normalized(sourceGroup).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

function macroEnergy(nutrients: NutrientsPer100g): number | null {
  const { proteinG, carbsG, fatG } = nutrients;
  if (proteinG === null || carbsG === null || fatG === null) return null;
  return Number((proteinG * 4 + carbsG * 4 + fatG * 9).toFixed(3));
}

function isEnergyWarning(official: number | null, derived: number | null): boolean {
  if (official === null || derived === null) return false;
  return Math.abs(official - derived) > Math.max(TACO_ENERGY_WARNING_ABSOLUTE_KCAL, official * TACO_ENERGY_WARNING_RELATIVE);
}

export async function parseTacoDataset(file: string): Promise<TacoParseResult> {
  const workbook = new Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = workbook.getWorksheet(TACO_WORKSHEET);
  if (!sheet) throw new Error(`TACO worksheet not found: ${TACO_WORKSHEET}`);

  const raw: NutritionCatalogImportRecord[] = [];
  const parserWarnings: string[] = [];
  let currentGroup = "";
  let totalRows = 0;

  sheet.eachRow((row) => {
    const sourceIdentity = row.getCell(1).value;
    const canonicalName = textValue(row.getCell(2).value);
    const maybeGroup = textValue(sourceIdentity);
    if (maybeGroup && (!canonicalName || normalized(maybeGroup) === normalized(canonicalName))) {
      if (!PAGE_HEADERS.has(normalized(maybeGroup))) currentGroup = maybeGroup;
      return;
    }
    const sourceNumber = numericValue(sourceIdentity);
    if (sourceNumber === null || !Number.isInteger(sourceNumber) || !canonicalName) return;
    totalRows += 1;

    const moisture = parseTacoNutrientCell(row.getCell(3).value);
    const calories = parseTacoNutrientCell(row.getCell(4).value);
    const protein = parseTacoNutrientCell(row.getCell(6).value);
    const fat = parseTacoNutrientCell(row.getCell(7).value);
    const carbs = parseTacoNutrientCell(row.getCell(9).value);
    const fiber = parseTacoNutrientCell(row.getCell(10).value);
    const normalizedCarbs = normalizeNearZeroNegativeCarbohydrate(carbs.value);
    const nutrientsPer100g: NutrientsPer100g = {
      calories: calories.value, proteinG: protein.value, carbsG: normalizedCarbs.value, fatG: fat.value, fiberG: fiber.value,
    };
    const macroDerivedEnergy = macroEnergy(nutrientsPer100g);
    const sourceFoodId = String(sourceNumber);
    if (isEnergyWarning(calories.value, macroDerivedEnergy)) parserWarnings.push(`${sourceFoodId}:ENERGY_DISCREPANCY`);
    if (normalizedCarbs.normalization) {
      parserWarnings.push(`${sourceFoodId}:NORMALIZED_NEAR_ZERO_NEGATIVE_TO_ZERO`);
    }
    const coverageCategories = classifyTacoCoverage(currentGroup, canonicalName);
    raw.push({
      canonicalName,
      sourceFoodId,
      foodGroup: primaryFoodGroup(coverageCategories, currentGroup),
      preparationState: derivePreparationState(canonicalName),
      nutrientsPer100g,
      ediblePortion: null,
      densityGPerMl: null,
      dataQuality: "IMPORTED",
      dietaryTags: [],
      allergenTags: [],
      allergenDataComplete: false,
      foodRole: null,
      budgetTier: null,
      preparationComplexity: null,
      sourceMetadata: {
        catalogVersion: PRAXE_TACO_CATALOG_VERSION,
        sourceRow: row.number,
        sourceFoodGroup: currentGroup,
        coverageCategories,
        moisturePer100g: moisture.value,
        officialEnergyKcal: calories.value,
        macroDerivedEnergyKcal: macroDerivedEnergy,
        valueMarkers: {
          moisture: moisture.marker, calories: calories.marker, protein: protein.marker,
          fat: fat.marker, carbs: carbs.marker, fiber: fiber.marker,
        },
        nutrientNormalizations: normalizedCarbs.normalization ? [normalizedCarbs.normalization] : [],
      },
    });
  });

  const imported = importNutritionCatalog(raw, {
    source: "TACO",
    sourceVersion: TACO_SOURCE_VERSION,
    sourceReference: TACO_SOURCE_REFERENCE,
    catalogScope: "PRODUCTION",
  });
  const duplicateSourceIds = imported.rejections
    .filter((item) => item.codes.includes("DUPLICATE_SOURCE_ID"))
    .map((item) => item.sourceFoodId)
    .filter((value): value is string => value !== null);
  const firstRawBySourceId = new Map<string, NutritionCatalogImportRecord>();
  for (const record of raw) if (!firstRawBySourceId.has(record.sourceFoodId)) firstRawBySourceId.set(record.sourceFoodId, record);
  const countMissing = (key: keyof NutrientsPer100g) => raw.filter((record) => record.nutrientsPer100g[key] === null).length;
  return {
    records: imported.acceptedRecords.map((record) => firstRawBySourceId.get(record.sourceFoodId) as NutritionCatalogImportRecord),
    report: {
      source: "TACO",
      sourceVersion: TACO_SOURCE_VERSION,
      catalogVersion: PRAXE_TACO_CATALOG_VERSION,
      totalRows,
      accepted: imported.acceptedRecords.length,
      rejected: imported.rejected,
      warnings: [...parserWarnings, ...imported.warnings],
      missingEnergy: countMissing("calories"),
      missingProtein: countMissing("proteinG"),
      missingCarbs: countMissing("carbsG"),
      missingFat: countMissing("fatG"),
      missingFiber: countMissing("fiberG"),
      duplicateSourceIds,
    },
  };
}
