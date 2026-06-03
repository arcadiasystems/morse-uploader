import { describe, expect, it, vi } from "vitest";
import type { WalrusStorageCostSource } from "../types.js";
import { estimateStorageCost } from "./estimate-storage-cost.js";

describe("estimateStorageCost", () => {
	it("maps the Walrus storage cost into a FROST estimate", async () => {
		const storageCost = vi
			.fn()
			.mockResolvedValue({ storageCost: 10n, writeCost: 2n, totalCost: 12n });
		const source = { storageCost } as unknown as WalrusStorageCostSource;

		const result = await estimateStorageCost(source, 1000, 5);
		expect(storageCost).toHaveBeenCalledWith(1000, 5);
		expect(result).toEqual({
			storageCostFrost: 10n,
			writeCostFrost: 2n,
			totalCostFrost: 12n,
		});
	});
});
