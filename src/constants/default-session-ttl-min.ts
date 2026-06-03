/**
 * Default Seal SessionKey lifetime in minutes: long enough for one decrypt,
 * short enough to limit reuse. Consumers override per-call via `ttlMin`.
 */
export const DEFAULT_SESSION_TTL_MIN = 10;
