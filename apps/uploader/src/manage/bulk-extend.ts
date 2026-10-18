import type { BlobRow } from "@/blobs/blob-row";
import type { EpochClock } from "@/blobs/epoch-clock";
import { inBatches, signatureCount } from "@/lib/batches";
import { MAX_EXTENDS_PER_TRANSACTION } from "./auto-extend";
import {
	type ExtendItem,
	extendBlocker,
	extendFrost,
	extendHeadroom,
} from "./extend-rules";

/**
 * Extending many blobs at once (PROTOCOL-NOTES section 8): one extend per
 * blob, up to 50 per transaction, so the wallet asks once per 50. Blobs go
 * soonest to expire first. Each gets the asked epochs, or what still fits
 * within the 53-epoch limit. An optional WAL cap bounds the spend: a blob
 * whose extend would pass it is left out, and cheaper ones after it can
 * still fit, as auto-extend does.
 */
export interface BulkExtendInput {
	/** The blobs to extend; ones that cannot be extended are left out. */
	rows: readonly BlobRow[];
	epochs: number;
	clock: Pick<EpochClock, "epoch">;
	maxEpochsAhead: number;
	pricePerUnit: bigint;
	/** The most this may spend, in FROST; `null` for no cap. */
	capFrost: bigint | null;
}

export interface BulkExtendPlan {
	items: readonly ExtendItem[];
	/** The items in transactions of at most 50, in order. */
	batches: readonly (readonly ExtendItem[])[];
	signatures: number;
	totalFrost: bigint;
	/** Blobs that get fewer epochs than asked: the 53-epoch limit. */
	capped: number;
	/** Blobs that could be extended but whose extend does not fit in the cap. */
	overCap: readonly BlobRow[];
}

export function planBulkExtend({
	rows,
	epochs,
	clock,
	maxEpochsAhead,
	pricePerUnit,
	capFrost,
}: BulkExtendInput): BulkExtendPlan {
	const soonestFirst = rows
		.filter((row) => extendBlocker(row.blob, clock, maxEpochsAhead) === null)
		.sort(
			(a, b) =>
				a.blob.endEpoch - b.blob.endEpoch ||
				a.blob.objectId.localeCompare(b.blob.objectId),
		);
	const items: ExtendItem[] = [];
	const overCap: BlobRow[] = [];
	let totalFrost = 0n;
	let capped = 0;
	for (const row of soonestFirst) {
		const headroom = extendHeadroom(
			row.blob.endEpoch,
			clock.epoch,
			maxEpochsAhead,
		);
		const granted = Math.min(epochs, headroom);
		const frost = extendFrost(row.blob.encodedSize, granted, pricePerUnit);
		if (capFrost !== null && totalFrost + frost > capFrost) {
			overCap.push(row);
			continue;
		}
		if (granted < epochs) capped += 1;
		totalFrost += frost;
		items.push({
			objectId: row.blob.objectId,
			epochs: granted,
			frost,
			newEndEpoch: row.blob.endEpoch + granted,
		});
	}
	return {
		items,
		batches: inBatches(items, MAX_EXTENDS_PER_TRANSACTION),
		signatures: signatureCount(items.length, MAX_EXTENDS_PER_TRANSACTION),
		totalFrost,
		capped,
		overCap,
	};
}
