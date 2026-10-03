import type { UserFitnessContext } from "./model.ts";

export type FitnessRouteServiceErrorCode =
  | "AI_UNAVAILABLE"
  | "INVALID_AI_RESPONSE"
  | "PERSISTENCE_FAILED";

export class FitnessRouteServiceError extends Error {
  readonly code: FitnessRouteServiceErrorCode;
  readonly status: 502 | 503;

  constructor(
    code: FitnessRouteServiceErrorCode,
    status: 502 | 503,
    cause?: unknown
  ) {
    super(code, { cause });
    this.name = "FitnessRouteServiceError";
    this.code = code;
    this.status = status;
  }
}

export type FitnessRouteAccess<TClient> = {
  client: TClient;
  userId: string;
};

type FitnessRoutePipelineOptions<TClient, TValidated, TResult> = {
  requireActiveSubscription: () => Promise<FitnessRouteAccess<TClient>>;
  loadFitnessContext: (
    client: TClient,
    userId: string
  ) => Promise<UserFitnessContext>;
  validate: (context: UserFitnessContext) => Promise<TValidated> | TValidated;
  run: (
    validated: TValidated,
    access: FitnessRouteAccess<TClient>
  ) => Promise<TResult>;
};

/**
 * Fail-closed ordering for routes that send normalized fitness context to AI.
 * A rejected access gate prevents context reads, AI calls, and persistence.
 */
export async function runFitnessRoutePipeline<TClient, TValidated, TResult>(
  options: FitnessRoutePipelineOptions<TClient, TValidated, TResult>
): Promise<TResult> {
  const access = await options.requireActiveSubscription();
  const context = await options.loadFitnessContext(access.client, access.userId);
  const validated = await options.validate(context);
  return options.run(validated, access);
}
