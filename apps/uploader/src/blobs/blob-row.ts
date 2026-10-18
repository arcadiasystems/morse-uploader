import type { BlobRecord } from "./blob-record";
import { type BlobStatus, blobStatus } from "./blob-status";
import type { EpochClock } from "./epoch-clock";

/** A blob with its status at the time of the read, ready to list. */
export interface BlobRow {
	blob: BlobRecord;
	status: BlobStatus;
	/** The blob's name, or its short blob id when it has none. */
	label: string;
	/**
	 * Estimated start of the epoch it was registered in: when it was
	 * uploaded, as near as chain can say. Blob objects carry no timestamp.
	 */
	registeredAtMs: number;
}

/** Shortens a blob id for display, as the design shows it: `0iKeiiQ2…m7Xp`. */
export function shortenBlobId(blobId: string): string {
	if (blobId.length <= 14) return blobId;
	return `${blobId.slice(0, 8)}…${blobId.slice(-4)}`;
}

export function toBlobRows(
	blobs: readonly BlobRecord[],
	clock: EpochClock,
	nowMs: number,
): BlobRow[] {
	return blobs.map((blob) => ({
		blob,
		status: blobStatus(blob, clock, nowMs),
		label: blob.name ?? shortenBlobId(blob.blobId),
		registeredAtMs:
			clock.epochStartMs +
			(blob.registeredEpoch - clock.epoch) * clock.epochDurationMs,
	}));
}

/**
 * Whether a quilt's index can be read from storage nodes: it was certified
 * and its storage has not ended. Nodes may drop an expired blob's slivers.
 */
export function hasReadablePatches(row: BlobRow): boolean {
	return (
		row.blob.isQuilt &&
		row.status.kind !== "registered" &&
		row.status.kind !== "expired"
	);
}
