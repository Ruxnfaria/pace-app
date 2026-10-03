const PREFIX = 'praxe:onboarding-v22:attempt:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function getOnboardingV22AttemptKey(userScope: string) { return `${PREFIX}:${encodeURIComponent(userScope)}`; }
export function isOnboardingV22Attempt(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }

export function createSingleFlight<TArgs extends unknown[], TResult>(operation: (...args: TArgs) => Promise<TResult>) {
  let running: Promise<TResult> | null = null;
  return (...args: TArgs): Promise<TResult> => {
    if (running) return running;
    running = operation(...args).finally(() => { running = null; });
    return running;
  };
}
