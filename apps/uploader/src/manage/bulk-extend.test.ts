import { describe, expect, it } from "vitest";
import { blobRow, TESTNET_CLOCK } from "@/blobs/fixtures";
import { planBulkExtend } from "./bulk-extend";
import { extendFrost } from "./extend-rules";

/** Testnet storage price on 2026-10-18, FROST per MiB per epoch (system object). */
const TESTNET_PRICE = 2_464n;
/** A 1-byte blob encodes to 66,034,000 bytes on 1000 shards: 63 started MiB. */
const SMALL_ENCODED = 66_034_000n;

const plan = (
	rows: Parameters<typeof planBulkExtend>[0]["rows"],
	epochs: number,
	capFrost: bigint | null = null,
) =>
	planBulkExtend({
		rows,
		epochs,
		clock: TESTNET_CLOCK,
		maxEpochsAhead: 53,
		pricePerUnit: TESTNET_PRICE,
		capFrost,
	});

describe("planBulkExtend", () => {
	const live = blobRow({ endEpoch: 555, encodedSize: SMALL_ENCODED });
	const nearLimit = blobRow({ endEpoch: 605, encodedSize: SMALL_ENCODED });
	const expired = blobRow({ endEpoch: 554 });
	const registered = blobRow({ certifiedEpoch: null, endEpoch: 556 });

	it("extends each blob, capping those near the 53-epoch limit", () => {
		const result = plan([nearLimit, live], 5);
		expect(result.items.map((item) => [item.epochs, item.newEndEpoch])).toEqual(
			[
				[5, 560],
				[2, 607],
			],
		);
		expect(result.capped).toBe(1);
		expect(result.totalFrost).toBe(
			extendFrost(SMALL_ENCODED, 7, TESTNET_PRICE),
		);
	});

	it("leaves out what cannot be extended", () => {
		const result = plan([expired, registered, live], 1);
		expect(result.items.map((item) => item.objectId)).toEqual([
			live.blob.objectId,
		]);
		expect(result.signatures).toBe(1);
	});
});
