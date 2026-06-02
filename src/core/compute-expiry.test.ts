import { describe, expect, it } from "vitest";
import { computeExpiry } from "./compute-expiry.js";

describe("computeExpiry", () => {
	it("computes relative expiry when firstEpochStartMs is absent", () => {
		const expiry = computeExpiry(
			10,
			{ currentEpoch: 4, epochDurationMs: 1000 },
			5000,
		);
		expect(expiry).toEqual({
			endEpoch: 10,
			expiresAtMs: 11000,
			expiresInMs: 6000,
			expired: false,
		});
	});

	it("computes absolute expiry when firstEpochStartMs is present", () => {
		const expiry = computeExpiry(
			10,
			{ currentEpoch: 4, epochDurationMs: 1000, firstEpochStartMs: 0 },
			5000,
		);
		expect(expiry.expiresAtMs).toBe(10000);
		expect(expiry.expiresInMs).toBe(5000);
		expect(expiry.expired).toBe(false);
	});

	it("marks a past end-epoch as expired", () => {
		const expiry = computeExpiry(
			3,
			{ currentEpoch: 5, epochDurationMs: 1000 },
			5000,
		);
		expect(expiry.expiresInMs).toBe(-2000);
		expect(expiry.expired).toBe(true);
	});
});
