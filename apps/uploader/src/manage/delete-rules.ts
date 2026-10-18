import type { BlobRecord } from "@/blobs/blob-record";
import type { EpochClock } from "@/blobs/epoch-clock";

/**
 * When a blob can be deleted (PROTOCOL-NOTES section 8, Move
 * `blob.move:236-247`): it must be deletable and its storage not ended.
 * Certification is not required, so a registered blob that never finished
 * can be deleted too. Delete returns the blob's `Storage` object to the
 * wallet; no WAL is refunded (notes section 13, item 16).
 */
export type DeleteBlocker =
	| { kind: "permanent" }
	| { kind: "expired"; endEpoch: number };

export function deleteBlocker(
	blob: Pick<BlobRecord, "deletable" | "endEpoch">,
	clock: Pick<EpochClock, "epoch">,
): DeleteBlocker | null {
	if (blob.endEpoch <= clock.epoch)
		return { kind: "expired", endEpoch: blob.endEpoch };
	if (!blob.deletable) return { kind: "permanent" };
	return null;
}

export function deleteBlockerText(blocker: DeleteBlocker): string {
	switch (blocker.kind) {
		case "permanent":
			return "This blob is permanent: it was uploaded without Deletable, so it stays until its storage ends.";
		case "expired":
			return `Its storage ended at epoch ${blocker.endEpoch}, and an expired blob cannot be deleted. Its record stays on Sui.`;
	}
}
