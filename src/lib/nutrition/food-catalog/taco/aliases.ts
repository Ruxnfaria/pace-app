export interface CuratedTacoAlias {
  sourceFoodId: string;
  alias: string;
}

// These aliases preserve the exact preparation state and only reorder or add a
// common unambiguous qualifier. Broad aliases such as "arroz" are forbidden.
export const CURATED_TACO_ALIASES: readonly CuratedTacoAlias[] = [
  { sourceFoodId: "3", alias: "arroz branco tipo 1 cozido" },
  { sourceFoodId: "410", alias: "peito de frango sem pele grelhado" },
  { sourceFoodId: "561", alias: "feijão carioca cozido" },
] as const;
