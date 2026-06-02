import { describe, expect, it } from "vitest";
import { parseTxReceipt } from "./parse-tx-receipt.js";

type Tx = Parameters<typeof parseTxReceipt>[0];

const id1 = `0x${"a".repeat(64)}`;

describe("parseTxReceipt", () => {
	it("maps a finalized transaction to a TxReceipt", () => {
		const tx = {
			digest: "0xdigest",
			effects: {
				gasUsed: {
					computationCost: "10",
					storageCost: "5",
					storageRebate: "3",
				},
				changedObjects: [
					{ idOperation: "Created", objectId: id1 },
					{ idOperation: "Deleted", objectId: id1 },
				],
			},
			objectTypes: { [id1]: "0xpkg::m::T" },
		} as unknown as Tx;

		const receipt = parseTxReceipt(tx);
		expect(receipt.digest).toBe("0xdigest");
		expect(receipt.gasUsedMist).toBe(12n);
		expect(receipt.createdObjects).toHaveLength(1);
		expect(receipt.deletedObjects).toHaveLength(1);
	});

	it("defaults objectTypes to empty when missing", () => {
		const tx = {
			digest: "0xdigest",
			effects: {
				gasUsed: { computationCost: "0", storageCost: "0", storageRebate: "0" },
				changedObjects: [{ idOperation: "Created", objectId: id1 }],
			},
		} as unknown as Tx;
		// No objectTypes means the created object has no resolved type and is skipped.
		expect(parseTxReceipt(tx).createdObjects).toHaveLength(0);
	});

	it("throws when effects are missing", () => {
		const tx = { digest: "0xdigest" } as unknown as Tx;
		expect(() => parseTxReceipt(tx)).toThrow(/effects missing/);
	});
});
