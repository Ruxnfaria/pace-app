type WorkoutDisplayNameInput = {
  title: string;
  muscleGroup?: string | null;
  exerciseNames?: readonly string[];
};

const TECHNICAL_TITLE = /^(?:treino|workout)[\s_-]*[a-z0-9]+$|^[a-z]$/i;

const GROUP_RULES = [
  { label: "Peito", pattern: /\b(peito|peitoral|chest)\b/ },
  { label: "Tríceps", pattern: /\b(triceps|tríceps)\b/ },
  { label: "Costas", pattern: /\b(costas|dorsal|dorsais|back)\b/ },
  { label: "Bíceps", pattern: /\b(biceps|bíceps)\b/ },
  { label: "Pernas", pattern: /\b(perna|pernas|quadriceps|quadríceps|leg|legs)\b/ },
  { label: "Glúteos", pattern: /\b(gluteo|glúteo|gluteos|glúteos|glute|glutes)\b/ },
  { label: "Posterior", pattern: /\b(posterior|posteriores|hamstring|hamstrings)\b/ },
  { label: "Ombros", pattern: /\b(ombro|ombros|deltoide|deltoides|shoulder|shoulders)\b/ },
  { label: "Abdômen", pattern: /\b(abdomen|abdômen|abdominal|abdominais|core)\b/ },
] as const;

const EXERCISE_RULES = [
  { label: "Peito", pattern: /supino|crucifixo|peitoral|chest|crossover|flex[aã]o/ },
  { label: "Tríceps", pattern: /tr[ií]ceps|triceps|franc[eê]s|testa/ },
  { label: "Costas", pattern: /puxada|remada|barra fixa|pulldown|dorsal/ },
  { label: "Bíceps", pattern: /b[ií]ceps|biceps|rosca/ },
  { label: "Pernas", pattern: /agachamento|leg press|extensora|quadr[ií]ceps|panturrilha|avan[cç]o|afundo/ },
  { label: "Glúteos", pattern: /gl[uú]teo|hip thrust|eleva[cç][aã]o p[eé]lvica|abdutora/ },
  { label: "Posterior", pattern: /posterior|stiff|levantamento terra|flexora|hamstring/ },
  { label: "Ombros", pattern: /ombro|desenvolvimento|eleva[cç][aã]o lateral|eleva[cç][aã]o frontal|deltoide/ },
  { label: "Abdômen", pattern: /abd[oô]men|abdominal|prancha|core/ },
] as const;

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function isTechnicalWorkoutTitle(title: string): boolean {
  return TECHNICAL_TITLE.test(title.trim());
}

function labelsFromMuscleGroup(value: string): string | null {
  const normalized = normalize(value);
  if (/full[\s_-]*body|corpo inteiro|corpo todo/.test(normalized)) return "Full Body";
  if (/upper|superior|superiores/.test(normalized)) return "Superiores";
  if (/lower|inferior|inferiores/.test(normalized)) return "Inferiores";
  if (/\bpush\b/.test(normalized)) return "Push";
  if (/\bpull\b/.test(normalized)) return "Pull";
  const labels = GROUP_RULES
    .filter((rule) => rule.pattern.test(normalized))
    .map((rule) => rule.label);
  return labels.length ? [...new Set(labels)].slice(0, 2).join(" + ") : null;
}

function labelsFromExercises(exerciseNames: readonly string[]): string | null {
  const scores = new Map<string, number>();
  for (const exerciseName of exerciseNames) {
    const normalized = normalize(exerciseName);
    for (const rule of EXERCISE_RULES) {
      if (rule.pattern.test(normalized)) {
        scores.set(rule.label, (scores.get(rule.label) ?? 0) + 1);
      }
    }
  }
  const ranked = [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([label]) => label);
  if (!ranked.length) return null;

  if (scores.has("Peito") && scores.has("Tríceps")) return "Peito + Tríceps";
  if (scores.has("Costas") && scores.has("Bíceps")) return "Costas + Bíceps";
  if (scores.has("Pernas") && scores.has("Glúteos")) return "Pernas + Glúteos";
  if (scores.has("Glúteos") && scores.has("Posterior")) return "Glúteos + Posterior";
  if (scores.has("Ombros") && scores.has("Abdômen")) return "Ombros + Abdômen";

  const upper = ranked.filter((label) => ["Peito", "Tríceps", "Costas", "Bíceps", "Ombros"].includes(label));
  const lower = ranked.filter((label) => ["Pernas", "Glúteos", "Posterior"].includes(label));
  const hasCore = ranked.includes("Abdômen");
  if ((upper.length >= 2 && lower.length >= 1) || (lower.length >= 2 && upper.length >= 1)) return "Full Body";
  if (lower.length >= 2) return lower.slice(0, 2).join(" + ");
  if (upper.length >= 3) return "Superiores";
  if (upper.length >= 2) return upper.slice(0, 2).join(" + ");
  if (upper.length === 1 && hasCore) return `${upper[0]} + Abdômen`;
  if (lower.length === 1) return lower[0];
  if (upper.length === 1) return upper[0];
  return hasCore ? "Abdômen" : null;
}

export function resolveWorkoutDisplayName({
  title,
  muscleGroup,
  exerciseNames = [],
}: WorkoutDisplayNameInput): string {
  const fallback = title.trim();
  if (!isTechnicalWorkoutTitle(fallback)) return fallback;
  if (muscleGroup) {
    const metadataLabel = labelsFromMuscleGroup(muscleGroup);
    if (metadataLabel) return metadataLabel;
  }
  return labelsFromExercises(exerciseNames) ?? fallback;
}
