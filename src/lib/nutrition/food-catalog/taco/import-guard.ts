export const AUTHORIZED_TACO_STAGING_PROJECT_REF = "fuagyujetzuzfjzhllko" as const;

export interface AuthorizedTacoImportTarget {
  projectRef: typeof AUTHORIZED_TACO_STAGING_PROJECT_REF;
  supabaseUrl: string;
}

export function assertAuthorizedTacoImportTarget(
  targetProjectRef: string | undefined,
  supabaseUrl: string | undefined,
): AuthorizedTacoImportTarget {
  const projectRef = targetProjectRef?.trim();
  const rawUrl = supabaseUrl?.trim();
  if (projectRef !== AUTHORIZED_TACO_STAGING_PROJECT_REF || !rawUrl) {
    throw new Error("UNAUTHORIZED_TACO_TARGET_PROJECT");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error("UNAUTHORIZED_TACO_TARGET_PROJECT");
  }
  if (
    parsedUrl.protocol !== "https:"
    || parsedUrl.hostname !== `${AUTHORIZED_TACO_STAGING_PROJECT_REF}.supabase.co`
  ) {
    throw new Error("UNAUTHORIZED_TACO_TARGET_PROJECT");
  }

  return {
    projectRef: AUTHORIZED_TACO_STAGING_PROJECT_REF,
    supabaseUrl: parsedUrl.origin,
  };
}
