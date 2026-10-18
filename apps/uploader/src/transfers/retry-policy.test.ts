import { describe, expect, it } from "vitest";
import {
	MAX_ATTEMPTS,
	retriesAutomatically,
	retryDelayMs,
} from "./retry-policy";

describe("retry policy", () => {
	it("backs off 2 s, then 4 s", () => {
		expect(retryDelayMs(2)).toBe(2_000);
		expect(retryDelayMs(3)).toBe(4_000);
	});

	it("retries the relay upload on its own, up to three attempts", () => {
		expect(MAX_ATTEMPTS).toBe(3);
		expect(retriesAutomatically("upload", 1)).toBe(true);
		expect(retriesAutomatically("upload", 2)).toBe(true);
		expect(retriesAutomatically("upload", 3)).toBe(false);
	});

	it("never retries a step that asks the wallet to sign, or encoding", () => {
		for (const step of ["encode", "register", "certify", "record"] as const)
			expect(retriesAutomatically(step, 1)).toBe(false);
	});
});
