import type { BlobRecord } from "@/blobs/blob-record";
import type { BlobRow } from "@/blobs/blob-row";
import type { EpochClock } from "@/blobs/epoch-clock";
import { storageUnits } from "@/upload/encoded-size";

/**
 * Extending a blob (PROTOCOL-NOTES sections 5 and 8, Move
 * `system_state_inner.move:390-427`): the blob must be certified and not
 * expired, and its new end must stay within 53 epochs of now:
 * `end_epoch - current_epoch + extra <= 53`. It costs storage only, no
 * write fee: `units × storage price × epochs`.
 */

/** Why a blob cannot be extended. */
export type ExtendBlocker =
	| { kind: "registered" }
	| { kind: "expired"; endEpoch: number }
	| { kind: "at-limit"; maxEpochsAhead: number };

/** The most epochs a blob ending at `endEpoch` can still be extended by; 0 at the limit. */
export function extendHeadroom(
	endEpoch: number,
	currentEpoch: number,
	maxEpochsAhead: number,
): number {
	return Math.max(0, maxEpochsAhead - (endEpoch - currentEpoch));
}

export function extendBlocker(
	blob: Pick<BlobRecord, "certifiedEpoch" | "endEpoch">,
	clock: Pick<EpochClock, "epoch">,
	maxEpochsAhead: number,
): ExtendBlocker | null {
	if (blob.endEpoch <= clock.epoch)
		return { kind: "expired", endEpoch: blob.endEpoch };
	if (blob.certifiedEpoch === null) return { kind: "registered" };
	if (extendHeadroom(blob.endEpoch, clock.epoch, maxEpochsAhead) === 0)
		return { kind: "at-limit", maxEpochsAhead };
	return null;
}

export function extendBlockerText(blocker: ExtendBlocker): string {
	switch (blocker.kind) {
		case "registered":
			return "Only a certified blob can be extended. Finish it first.";
		case "expired":
			return `Its storage ended at epoch ${blocker.endEpoch}. An expired blob cannot be extended.`;
		case "at-limit":
			return `It is already paid ${blocker.maxEpochsAhead} epochs ahead, the most anyone can hold.`;
	}
}

/** The WAL an extend costs, in FROST: the same sum the SDK pays from the wallet. */
export function extendFrost(
	encodedSize: bigint,
	epochs: number,
	storagePricePerUnit: bigint,
): bigint {
	return storageUnits(encodedSize) * storagePricePerUnit * BigInt(epochs);
}

/** One blob in an extend transaction. */
export interface ExtendItem {
	objectId: string;
	epochs: number;
	frost: bigint;
	/** The end epoch after the extend. */
	newEndEpoch: number;
}

export interface ExtendPlan {
	items: readonly ExtendItem[];
	/** Blobs that could take fewer epochs than asked, because of the 53-epoch limit. */
	capped: number;
	/** Blobs left out, with why. */
	skipped: readonly { row: BlobRow; blocker: ExtendBlocker }[];
	totalFrost: bigint;
}

/**
 * Extends of `epochs` for each blob, each limited to what still fits within
 * the 53-epoch limit. Blobs that cannot be extended are listed as skipped.
 */
export function planExtend(
	rows: readonly BlobRow[],
	epochs: number,
	clock: Pick<EpochClock, "epoch">,
	maxEpochsAhead: number,
	storagePricePerUnit: bigint,
): ExtendPlan {
	const items: ExtendItem[] = [];
	const skipped: { row: BlobRow; blocker: ExtendBlocker }[] = [];
	let capped = 0;
	let totalFrost = 0n;
	for (const row of rows) {
		const blocker = extendBlocker(row.blob, clock, maxEpochsAhead);
		if (blocker) {
			skipped.push({ row, blocker });
			continue;
		}
		const headroom = extendHeadroom(
			row.blob.endEpoch,
			clock.epoch,
			maxEpochsAhead,
		);
		const granted = Math.min(epochs, headroom);
		if (granted < epochs) capped += 1;
		const frost = extendFrost(
			row.blob.encodedSize,
			granted,
			storagePricePerUnit,
		);
		totalFrost += frost;
		items.push({
			objectId: row.blob.objectId,
			epochs: granted,
			frost,
			newEndEpoch: row.blob.endEpoch + granted,
		});
	}
	return { items, capped, skipped, totalFrost };
}
