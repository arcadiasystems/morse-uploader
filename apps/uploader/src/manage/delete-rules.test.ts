import { describe, expect, it } from "vitest";
import { TESTNET_CLOCK } from "@/blobs/fixtures";
import { deleteBlocker, deleteBlockerText } from "./delete-rules";

describe("deleteBlocker (PROTOCOL-NOTES section 8, blob.move:236-247)", () => {
	it("allows a deletable blob whose storage has not ended", () => {
		expect(
			deleteBlocker({ deletable: true, endEpoch: 555 }, TESTNET_CLOCK),
		).toBeNull();
	});

	it("blocks a permanent blob", () => {
		expect(
			deleteBlocker({ deletable: false, endEpoch: 600 }, TESTNET_CLOCK),
		).toEqual({
			kind: "permanent",
		});
	});

	it("blocks an expired blob, at its end epoch and after", () => {
		expect(
			deleteBlocker({ deletable: true, endEpoch: 554 }, TESTNET_CLOCK),
		).toEqual({
			kind: "expired",
			endEpoch: 554,
		});
		expect(
			deleteBlocker({ deletable: false, endEpoch: 456 }, TESTNET_CLOCK),
		).toEqual({
			kind: "expired",
			endEpoch: 456,
		});
	});

	it("explains each block in plain words", () => {
		expect(deleteBlockerText({ kind: "permanent" })).toContain("permanent");
		expect(deleteBlockerText({ kind: "expired", endEpoch: 554 })).toContain(
			"Its record stays on Sui.",
		);
	});
});
