export type AccessErrorCode =
  | "UNAUTHENTICATED"
  | "SUBSCRIPTION_REQUIRED"
  | "ACCESS_UNAVAILABLE";

export class AccessError extends Error {
  readonly code: AccessErrorCode;
  readonly status: 401 | 403 | 503;

  constructor(code: AccessErrorCode, status: 401 | 403 | 503) {
    super(code);
    this.name = "AccessError";
    this.code = code;
    this.status = status;
  }
}

export type AccessLookupResult =
  | { kind: "authenticated"; userId: string; status: string | null }
  | { kind: "unauthenticated" }
  | { kind: "unavailable" };

export function assertActiveSubscription(result: AccessLookupResult): string {
  if (result.kind === "unauthenticated") {
    throw new AccessError("UNAUTHENTICATED", 401);
  }
  if (result.kind === "unavailable") {
    throw new AccessError("ACCESS_UNAVAILABLE", 503);
  }
  if (result.status !== "ativo") {
    throw new AccessError("SUBSCRIPTION_REQUIRED", 403);
  }
  return result.userId;
}
