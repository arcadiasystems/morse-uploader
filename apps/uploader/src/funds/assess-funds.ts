import type { Balances, FundsAssessment, FundsFloor } from "./types";

/**
 * The low-funds rule. A wallet is low on a network when it cannot pay for one
 * upload of the smallest possible blob for the shortest period:
 *
 * - WAL is low below the storage plus write fee for a 1-byte blob for one
 *   epoch, priced live from the Walrus system object. Every blob carries about
 *   64 MB of encoding metadata, so this is the floor for any upload.
 * - SUI is low below the network fees of that upload's two transactions,
 *   register and certify.
 */
export function assessFunds(
	balances: Balances,
	floor: FundsFloor,
): FundsAssessment {
	const walLow = balances.wal < floor.walFrost;
	const suiLow = balances.sui < floor.suiMist;
	return { walLow, suiLow, low: walLow || suiLow };
}
