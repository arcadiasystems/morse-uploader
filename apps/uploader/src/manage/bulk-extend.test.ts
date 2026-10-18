import { describe, expect, it } from "vitest";
import { blobRow, TESTNET_CLOCK } from "@/blobs/fixtures";
import { MAX_EXTENDS_PER_TRANSACTION } from "./auto-extend";
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

	it("adds up each blob's units x price x epochs", () => {
		const small = blobRow({ endEpoch: 560, encodedSize: SMALL_ENCODED });
		// 1 GiB raw encodes to 4,888,852,000 B: 4,663 MiB units (PROTOCOL-NOTES section 3).
		const big = blobRow({ endEpoch: 570, encodedSize: 4_888_852_000n });
		const result = plan([small, big], 3);
		expect(result.items.map((item) => item.frost)).toEqual([
			extendFrost(SMALL_ENCODED, 3, TESTNET_PRICE),
			4_663n * TESTNET_PRICE * 3n,
		]);
		expect(result.totalFrost).toBe(
			extendFrost(SMALL_ENCODED, 3, TESTNET_PRICE) +
				4_663n * TESTNET_PRICE * 3n,
		);
	});

	it("goes soonest to expire first, ties by object id", () => {
		const later = blobRow({ endEpoch: 570 });
		const soonA = blobRow({
			endEpoch: 556,
			objectId: `0x${"b".repeat(64)}`,
		});
		const soonB = blobRow({
			endEpoch: 556,
			objectId: `0x${"a".repeat(64)}`,
		});
		const result = plan([later, soonA, soonB], 1);
		expect(result.items.map((item) => item.objectId)).toEqual([
			soonB.blob.objectId,
			soonA.blob.objectId,
			later.blob.objectId,
		]);
	});
});

describe("planBulkExtend under a WAL cap", () => {
	const oneEpoch = extendFrost(SMALL_ENCODED, 1, TESTNET_PRICE);
	const soonBig = blobRow({ endEpoch: 556, encodedSize: 4_888_852_000n });
	const laterSmall = blobRow({ endEpoch: 560, encodedSize: SMALL_ENCODED });
	const lastSmall = blobRow({ endEpoch: 565, encodedSize: SMALL_ENCODED });

	it("leaves out a blob that passes the cap while a cheaper later one still fits", () => {
		const result = plan([soonBig, laterSmall, lastSmall], 1, oneEpoch * 2n);
		expect(result.overCap).toEqual([soonBig]);
		expect(result.items.map((item) => item.objectId)).toEqual([
			laterSmall.blob.objectId,
			lastSmall.blob.objectId,
		]);
		expect(result.totalFrost).toBe(oneEpoch * 2n);
	});

	it("never plans more than the cap", () => {
		for (const cap of [0n, oneEpoch - 1n, oneEpoch, oneEpoch * 3n]) {
			const result = plan([laterSmall, lastSmall, soonBig], 2, cap);
			expect(result.totalFrost <= cap).toBe(true);
		}
		expect(plan([laterSmall], 1, 0n).items).toEqual([]);
	});

	it("takes everything with no cap", () => {
		const result = plan([soonBig, laterSmall, lastSmall], 1, null);
		expect(result.items).toHaveLength(3);
		expect(result.overCap).toEqual([]);
	});
});

describe("planBulkExtend batching", () => {
	it("puts 50 extends in a transaction: 120 blobs are 3 signatures", () => {
		const rows = Array.from({ length: 120 }, (_, index) =>
			blobRow({
				endEpoch: 556 + (index % 5),
				objectId: `0x${index.toString(16).padStart(64, "0")}`,
			}),
		);
		const result = plan(rows, 1);
		expect(MAX_EXTENDS_PER_TRANSACTION).toBe(50);
		expect(result.batches.map((batch) => batch.length)).toEqual([50, 50, 20]);
		expect(result.signatures).toBe(3);
		expect(result.batches.flat()).toEqual(result.items);
	});

	it("needs no signature when nothing can be extended", () => {
		const result = plan([blobRow({ endEpoch: 554 })], 1);
		expect(result.batches).toEqual([]);
		expect(result.signatures).toBe(0);
	});
});
