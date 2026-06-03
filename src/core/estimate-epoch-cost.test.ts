import { describe, expect, it, vi } from "vitest";
import type { WalrusStorageCostSource } from "../types.js";
import { estimateEpochCost } from "./estimate-epoch-cost.js";

function makeSource() {
	const storageCost = vi
		.fn()
		.mockResolvedValue({ storageCost: 10n, writeCost: 2n, totalCost: 12n });
	return {
		storageCost,
		source: { storageCost } as unknown as WalrusStorageCostSource,
	};
}

describe("estimateEpochCost", () => {
	it("prices the raw size when not encrypted", async () => {
		const { storageCost, source } = makeSource();
		const estimate = await estimateEpochCost(source, {
			sizeBytes: 1000,
			epochs: 5,
		});
		expect(storageCost).toHaveBeenCalledWith(1000, 5);
		expect(estimate).toMatchObject({
			sizeBytes: 1000,
			epochs: 5,
			encrypted: false,
			walFrost: 12n,
			suiGasMist: null,
		});
	});

	it("adds the default encryption overhead when encrypted", async () => {
		const { storageCost, source } = makeSource();
		await estimateEpochCost(source, {
			sizeBytes: 1000,
			epochs: 5,
			encrypt: true,
		});
		expect(storageCost).toHaveBeenCalledWith(1150, 5);
	});

	it("respects a custom encryption overhead", async () => {
		const { storageCost, source } = makeSource();
		await estimateEpochCost(source, {
			sizeBytes: 1000,
			epochs: 5,
			encrypt: true,
			encryptionOverheadBytes: 50,
		});
		expect(storageCost).toHaveBeenCalledWith(1050, 5);
	});

	it("passes through a SUI gas estimate", async () => {
		const { source } = makeSource();
		const estimate = await estimateEpochCost(source, {
			sizeBytes: 1000,
			epochs: 5,
			suiGasMist: 9999n,
		});
		expect(estimate.suiGasMist).toBe(9999n);
	});
});
