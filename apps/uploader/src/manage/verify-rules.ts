import type { BlobRecord } from "@/blobs/blob-record";
import { formatBytes } from "@/lib/format-bytes";

/** Verify reads the whole blob into the tab; above this, the Walrus CLI is the tool. */
export const MAX_VERIFY_BYTES = 200_000_000n;

/**
 * Why a blob cannot be verified in the browser (PROTOCOL-NOTES section 8):
 * nodes may have dropped an expired blob's slivers, an uncertified blob has
 * no confirmation that nodes hold it, and a rebuild holds the whole blob in
 * memory.
 */
export type VerifyBlocker =
	| { kind: "expired" }
	| { kind: "registered" }
	| { kind: "too-large"; limitBytes: bigint };

export function verifyBlocker(
	blob: Pick<BlobRecord, "certifiedEpoch" | "size">,
	expired: boolean,
): VerifyBlocker | null {
	if (expired) return { kind: "expired" };
	if (blob.certifiedEpoch === null) return { kind: "registered" };
	if (blob.size > MAX_VERIFY_BYTES)
		return { kind: "too-large", limitBytes: MAX_VERIFY_BYTES };
	return null;
}

export function verifyBlockerText(blocker: VerifyBlocker): string {
	switch (blocker.kind) {
		case "expired":
			return "Its storage has ended, so nodes may have dropped its slivers. Verify works on live blobs.";
		case "registered":
			return "Verify needs a certified blob: until certify, nodes have not confirmed they hold it.";
		case "too-large":
			return `Verify rebuilds the whole blob in this tab, which is limited to ${formatBytes(blocker.limitBytes)}. Use walrus read with the Walrus CLI for larger blobs.`;
	}
}
