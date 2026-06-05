import { describe, expect, it } from "vitest";
import { estimateStorageUsd } from "./estimate-storage-usd.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("estimateStorageUsd", () => {
	it("prices 1 GB for 30 testnet epochs (~1 month) at the default rate", () => {
		const estimate = estimateStorageUsd({
			sizeBytes: 1_000_000_000,
			epochs: 30,
			epochDurationMs: DAY_MS,
		});
		expect(estimate.gb).toBe(1);
		expect(estimate.months).toBe(1);
		expect(estimate.days).toBe(30);
		expect(estimate.usd).toBeCloseTo(0.023, 6);
	});

	it("scales with size and duration", () => {
		const estimate = estimateStorageUsd({
			sizeBytes: 2_000_000_000,
			epochs: 60,
			epochDurationMs: DAY_MS,
		});
		expect(estimate.usd).toBeCloseTo(0.092, 6); // 2 GB * 2 months * 0.023
	});

	it("folds in encryption overhead and honors a custom rate", () => {
		const estimate = estimateStorageUsd({
			sizeBytes: 1_000_000_000,
			epochs: 30,
			epochDurationMs: DAY_MS,
			encryptionOverheadBytes: 0,
			usdPerGbPerMonth: 0.05,
		});
		expect(estimate.usd).toBeCloseTo(0.05, 6);
	});
});
