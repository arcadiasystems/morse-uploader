import type { SuiClientTypes } from "@mysten/sui/client";

/** Human-readable message for a failed transaction's effects status. */
export function failedTransactionMessage(
	failed: SuiClientTypes.Transaction<{ effects: true }>,
): string {
	const error = failed.effects?.status?.error;
	if (error) {
		return `transaction failed: ${error.message}`;
	}
	return "transaction failed without effects status";
}
