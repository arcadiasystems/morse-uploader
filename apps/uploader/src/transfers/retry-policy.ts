import type { TransferStep } from "./transfer-state";

/** Attempts per step before an item fails and waits for the user. */
export const MAX_ATTEMPTS = 3;

/** First retry delay; each later one doubles it. */
const BASE_DELAY_MS = 2_000;

/** The wait before `attempt` (2 or more): 2 s, then 4 s. */
export function retryDelayMs(attempt: number): number {
	return BASE_DELAY_MS * 2 ** Math.max(0, attempt - 2);
}

/**
 * Whether a failed step retries on its own. Only the relay upload does:
 * its failures are timeouts and network or relay errors that often pass.
 * Steps that sign never retry on their own, because each attempt asks the
 * wallet again; encoding fails the same way every time.
 */
export function retriesAutomatically(
	step: TransferStep,
	attempt: number,
): boolean {
	return step === "upload" && attempt < MAX_ATTEMPTS;
}
