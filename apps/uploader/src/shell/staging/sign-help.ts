import type { SignaturePlan } from "@/upload/upload-cost";

/** "a, b and c": items joined as a sentence lists them. */
export function listText(items: readonly string[]): string {
	if (items.length <= 1) return items.join("");
	return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * How the signatures come, from the real flow (PROTOCOL-NOTES section 13,
 * item 8): one register per item, one certify for the batch, and one per
 * access policy and Morse entry.
 */
export function signHelp(signatures: SignaturePlan | null): string {
	const parts = [
		"Your wallet asks once per item to register and once to certify the batch",
	];
	if (signatures && signatures.encryptedItems > 0)
		parts.push("once per encrypted file to create its access policy");
	if (signatures && signatures.entries > 0) parts.push("once per Morse entry");
	return `${listText(parts)}.`;
}
