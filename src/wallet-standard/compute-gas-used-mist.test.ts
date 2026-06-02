import { describe, expect, it } from "vitest";
import { computeGasUsedMist } from "./compute-gas-used-mist.js";

type Gas = Parameters<typeof computeGasUsedMist>[0];

describe("computeGasUsedMist", () => {
	it("computes computation + storage minus rebate", () => {
		const gas = {
			computationCost: "100",
			storageCost: "50",
			storageRebate: "30",
		} as unknown as Gas;
		expect(computeGasUsedMist(gas)).toBe(120n);
	});

	it("can be negative when the rebate exceeds the cost", () => {
		const gas = {
			computationCost: "0",
			storageCost: "0",
			storageRebate: "10",
		} as unknown as Gas;
		expect(computeGasUsedMist(gas)).toBe(-10n);
	});
});
