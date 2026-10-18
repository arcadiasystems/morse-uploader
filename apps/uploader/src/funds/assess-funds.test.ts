import { describe, expect, it } from "vitest";
import { assessFunds } from "./assess-funds";

// The Testnet floor at 2026-10-17 prices: 63 storage units × (2,364 + 4,725) FROST,
// and the observed gas of one register plus one certify.
const floor = { walFrost: 446_607n, suiMist: 5_006_072n };

describe("assessFunds", () => {
	it("is not low when both balances cover one smallest upload", () => {
		expect(
			assessFunds({ wal: 225_962_348n, sui: 769_886_449n }, floor),
		).toEqual({
			walLow: false,
			suiLow: false,
			low: false,
		});
	});

	it("treats a balance exactly at the floor as enough", () => {
		expect(
			assessFunds({ wal: floor.walFrost, sui: floor.suiMist }, floor).low,
		).toBe(false);
	});

	it("flags WAL below the storage and write fee of the smallest blob", () => {
		expect(
			assessFunds({ wal: floor.walFrost - 1n, sui: 769_886_449n }, floor),
		).toEqual({
			walLow: true,
			suiLow: false,
			low: true,
		});
	});

	it("flags SUI below the gas of an upload's two transactions", () => {
		expect(
			assessFunds({ wal: 225_962_348n, sui: floor.suiMist - 1n }, floor),
		).toEqual({
			walLow: false,
			suiLow: true,
			low: true,
		});
	});

	it("flags an empty wallet on both counts", () => {
		expect(assessFunds({ wal: 0n, sui: 0n }, floor)).toEqual({
			walLow: true,
			suiLow: true,
			low: true,
		});
	});
});
