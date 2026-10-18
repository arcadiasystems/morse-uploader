import { describe, expect, it } from "vitest";
import { blobRow, TESTNET_CLOCK } from "@/blobs/fixtures";
import {
	type AutoExtendSettings,
	DEFAULT_AUTO_EXTEND,
	MAX_EXTENDS_PER_TRANSACTION,
	parseAutoExtend,
	planAutoExtend,
	proposalKey,
	serializeAutoExtend,
} from "./auto-extend";
import { extendFrost } from "./extend-rules";

const PRICE = 2_464n;
const SMALL = 66_034_000n;
/** One small blob renewed for one epoch: 63 units × 2,464 FROST. */
const ONE = extendFrost(SMALL, 1, PRICE);

const on: AutoExtendSettings = {
	enabled: true,
	capFrost: 10n * ONE,
	spentFrost: 0n,
	renewWithinEpochs: 1,
	extendByEpochs: 1,
};

function plan(
	rows: Parameters<typeof planAutoExtend>[0]["rows"],
	settings = on,
) {
	return planAutoExtend({
		rows,
		clock: TESTNET_CLOCK,
		settings,
		storagePricePerUnit: PRICE,
		maxEpochsAhead: 53,
	});
}

describe("planAutoExtend: which blobs", () => {
	it("does nothing while it is off", () => {
		expect(plan([blobRow({ endEpoch: 555 })], DEFAULT_AUTO_EXTEND)).toEqual({
			kind: "off",
		});
	});

	it("renews certified blobs within the renewal window, soonest first", () => {
		const later = blobRow({ endEpoch: 556, encodedSize: SMALL });
		const soon = blobRow({ endEpoch: 555, encodedSize: SMALL });
		const far = blobRow({ endEpoch: 600, encodedSize: SMALL });
		const result = plan([later, far, soon], { ...on, renewWithinEpochs: 2 });
		expect(result.kind).toBe("renew");
		if (result.kind !== "renew") return;
		expect(result.items.map((item) => item.objectId)).toEqual([
			soon.blob.objectId,
			later.blob.objectId,
		]);
		expect(result.items.map((item) => item.newEndEpoch)).toEqual([556, 557]);
		expect(result.totalFrost).toBe(2n * ONE);
	});

	it("never renews a registered blob or one past the limit", () => {
		const registered = blobRow({ certifiedEpoch: null, endEpoch: 555 });
		expect(plan([registered])).toEqual({ kind: "nothing-due" });
	});

	it("runs only while the app is open: a blob that expired meanwhile is not renewed", () => {
		// The app was closed through epoch 554's start: this blob's storage
		// ended at 554, so it can no longer be extended (blob.move:111-116).
		const missed = blobRow({ endEpoch: 554, encodedSize: SMALL });
		const stillLive = blobRow({ endEpoch: 555, encodedSize: SMALL });
		const result = plan([missed, stillLive]);
		expect(result.kind).toBe("renew");
		if (result.kind !== "renew") return;
		expect(result.items.map((item) => item.objectId)).toEqual([
			stillLive.blob.objectId,
		]);
	});

	it("limits each renewal to what fits within 53 epochs", () => {
		const nearLimit = blobRow({ endEpoch: 555, encodedSize: SMALL });
		const result = plan([nearLimit], {
			...on,
			extendByEpochs: 60,
			capFrost: 100n * ONE,
		});
		expect(result.kind === "renew" && result.items[0]?.epochs).toBe(52);
	});
});

describe("planAutoExtend: the WAL cap", () => {
	const rows = [
		blobRow({ endEpoch: 555, encodedSize: SMALL }),
		blobRow({ endEpoch: 555, encodedSize: SMALL }),
		blobRow({ endEpoch: 555, encodedSize: SMALL }),
	];

	it("renews only as many blobs as the cap still pays for", () => {
		const result = plan(rows, { ...on, capFrost: 2n * ONE + 1n });
		expect(result.kind).toBe("renew");
		if (result.kind !== "renew") return;
		expect(result.items).toHaveLength(2);
		expect(result.leftOut).toBe(1);
		expect(result.totalFrost).toBeLessThanOrEqual(2n * ONE + 1n);
	});

	it("counts what earlier cycles spent", () => {
		const result = plan(rows, {
			...on,
			capFrost: 3n * ONE,
			spentFrost: 2n * ONE,
		});
		expect(result.kind === "renew" && result.items).toHaveLength(1);
	});

	it("reports the cap as reached when no renewal fits", () => {
		expect(plan(rows, { ...on, capFrost: ONE, spentFrost: ONE })).toEqual({
			kind: "cap-reached",
			due: 3,
			remainingFrost: 0n,
		});
	});

	it("lets a cheaper blob through when a costlier one does not fit", () => {
		const big = blobRow({ endEpoch: 555, encodedSize: 10n * SMALL });
		const small = blobRow({ endEpoch: 555, encodedSize: SMALL });
		const result = plan([big, small], { ...on, capFrost: 2n * ONE });
		expect(
			result.kind === "renew" && result.items.map((item) => item.objectId),
		).toEqual([small.blob.objectId]);
	});

	it("keeps one transaction to at most 50 extends", () => {
		const many = Array.from({ length: 60 }, () =>
			blobRow({ endEpoch: 555, encodedSize: SMALL }),
		);
		const result = plan(many, { ...on, capFrost: 100n * ONE });
		expect(result.kind === "renew" && result.items).toHaveLength(
			MAX_EXTENDS_PER_TRANSACTION,
		);
		expect(result.kind === "renew" && result.leftOut).toBe(10);
	});
});

describe("proposalKey", () => {
	it("is the same for the same renewal in the same epoch, and changes otherwise", () => {
		const items = [
			{ objectId: "0xa", epochs: 1, frost: ONE, newEndEpoch: 556 },
		];
		expect(proposalKey(554, items)).toBe(proposalKey(554, items));
		expect(proposalKey(555, items)).not.toBe(proposalKey(554, items));
	});
});

describe("stored settings", () => {
	it("round-trip through localStorage text", () => {
		const settings = { ...on, spentFrost: 123n };
		expect(parseAutoExtend(serializeAutoExtend(settings))).toEqual(settings);
	});

	it("reject anything malformed instead of guessing", () => {
		expect(parseAutoExtend("not json")).toBeNull();
		expect(parseAutoExtend("null")).toBeNull();
		expect(
			parseAutoExtend(
				JSON.stringify({
					...JSON.parse(serializeAutoExtend(on)),
					capFrost: -5,
				}),
			),
		).toBeNull();
		expect(
			parseAutoExtend(
				JSON.stringify({
					...JSON.parse(serializeAutoExtend(on)),
					renewWithinEpochs: 0,
				}),
			),
		).toBeNull();
		expect(
			parseAutoExtend(
				JSON.stringify({
					...JSON.parse(serializeAutoExtend(on)),
					extendByEpochs: 54,
				}),
			),
		).toBeNull();
	});
});
