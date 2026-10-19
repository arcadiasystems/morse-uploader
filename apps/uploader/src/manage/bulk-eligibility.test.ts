import { describe, expect, it } from "vitest";
import type { BlobRow } from "@/blobs/blob-row";
import { blobRow, TESTNET_CLOCK } from "@/blobs/fixtures";
import {
	type BulkAction,
	bulkEligibility,
	groupLeftOut,
	leftOutReason,
	leftOutText,
} from "./bulk-eligibility";

const MAX_AHEAD = 53;
const reason = (action: BulkAction, row: BlobRow) =>
	leftOutReason(action, row, TESTNET_CLOCK, MAX_AHEAD);

// Testnet epoch 554: storage is live while the current epoch is below the end.
const live = blobRow({ endEpoch: 580 });
const expired = blobRow({ endEpoch: 554 });
const registered = blobRow({ certifiedEpoch: null, endEpoch: 556 });
const atLimit = blobRow({ endEpoch: 554 + MAX_AHEAD });
const permanent = blobRow({ deletable: false, endEpoch: 580 });
const encrypted = blobRow({ isEncrypted: true, endEpoch: 580 });
const quilt = blobRow({ isQuilt: true, endEpoch: 580 });
const large = blobRow({ size: 200_000_001n, endEpoch: 580 });

describe("bulk eligibility: the inspector's rules, per action", () => {
	it("extends certified, live blobs below the 53-epoch limit", () => {
		expect(reason("extend", live)).toBeNull();
		expect(reason("extend", expired)).toBe("expired");
		expect(reason("extend", registered)).toBe("registered");
		expect(reason("extend", atLimit)).toBe("at-limit");
	});

	it("deletes deletable, unexpired blobs, certified or not (blob.move:236-247)", () => {
		expect(reason("delete", live)).toBeNull();
		expect(reason("delete", registered)).toBeNull();
		expect(reason("delete", expired)).toBe("expired");
		expect(reason("delete", permanent)).toBe("permanent");
		expect(reason("delete", blobRow({ deletable: false, endEpoch: 554 }))).toBe(
			"expired",
		);
	});

	it("verifies certified, live blobs up to 200 MB", () => {
		expect(reason("verify", live)).toBeNull();
		expect(reason("verify", blobRow({ size: 200_000_000n }))).toBeNull();
		expect(reason("verify", expired)).toBe("expired");
		expect(reason("verify", registered)).toBe("registered");
		expect(reason("verify", large)).toBe("too-large");
	});

	it("shares certified, live blobs, quilts and encrypted ones included", () => {
		expect(reason("share", live)).toBeNull();
		expect(reason("share", quilt)).toBeNull();
		expect(reason("share", encrypted)).toBeNull();
		expect(reason("share", expired)).toBe("expired");
		expect(reason("share", registered)).toBe("registered");
	});

	it("publishes certified, deletable, unencrypted blobs that are not whole quilts", () => {
		expect(reason("publish", live)).toBeNull();
		expect(reason("publish", encrypted)).toBe("encrypted");
		expect(reason("publish", expired)).toBe("expired");
		expect(reason("publish", registered)).toBe("registered");
		expect(reason("publish", permanent)).toBe("permanent");
		expect(reason("publish", quilt)).toBe("quilt");
	});

	it("names encryption first for publish, whatever else applies", () => {
		expect(
			reason(
				"publish",
				blobRow({ isEncrypted: true, endEpoch: 554, deletable: false }),
			),
		).toBe("encrypted");
	});

	it("splits a selection into what an action takes and what it leaves out", () => {
		const { eligible, leftOut } = bulkEligibility(
			"delete",
			[live, permanent, registered, expired],
			TESTNET_CLOCK,
			MAX_AHEAD,
		);
		expect(eligible).toEqual([live, registered]);
		expect(leftOut).toEqual([
			{ row: permanent, reason: "permanent" },
			{ row: expired, reason: "expired" },
		]);
	});
});

describe("groupLeftOut", () => {
	it("groups by reason, most common first", () => {
		const second = blobRow({ endEpoch: 550 });
		const groups = groupLeftOut([
			{ row: permanent, reason: "permanent" },
			{ row: expired, reason: "expired" },
			{ row: second, reason: "expired" },
		]);
		expect(groups).toEqual([
			{ reason: "expired", rows: [expired, second] },
			{ reason: "permanent", rows: [permanent] },
		]);
	});

	it("gives nothing for nothing left out", () => {
		expect(groupLeftOut([])).toEqual([]);
	});
});

describe("leftOutText", () => {
	it("names the 53-epoch limit for a blob already paid that far", () => {
		expect(leftOutText("at-limit", MAX_AHEAD)).toBe(
			"already paid 53 epochs ahead",
		);
	});

	it("says why each reason keeps a blob out", () => {
		expect(leftOutText("expired", MAX_AHEAD)).toBe("storage ended");
		expect(leftOutText("permanent", MAX_AHEAD)).toBe(
			"permanent, not deletable",
		);
		expect(leftOutText("quilt", MAX_AHEAD)).toContain("inspector");
	});
});
