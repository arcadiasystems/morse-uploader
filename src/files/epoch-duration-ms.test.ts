import { describe, expect, it } from "vitest";
import { epochDurationMs } from "./epoch-duration-ms.js";

describe("epochDurationMs", () => {
	it("returns one day for testnet", () => {
		expect(epochDurationMs("testnet")).toBe(24 * 60 * 60 * 1000);
	});

	it("returns two weeks for mainnet", () => {
		expect(epochDurationMs("mainnet")).toBe(14 * 24 * 60 * 60 * 1000);
	});
});
