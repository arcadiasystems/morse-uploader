import { describe, expect, it } from "vitest";
import { createLimiter } from "./create-limiter";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createLimiter", () => {
	it("never runs more tasks at once than allowed, and runs them in order", async () => {
		const limit = createLimiter(2);
		let running = 0;
		let peak = 0;
		const started: number[] = [];
		const releases: (() => void)[] = [];
		const results = [1, 2, 3, 4, 5].map((n) =>
			limit(async () => {
				started.push(n);
				running += 1;
				peak = Math.max(peak, running);
				await new Promise<void>((resolve) => releases.push(resolve));
				running -= 1;
				return n * 10;
			}),
		);
		await settle();
		expect(started).toEqual([1, 2]);
		while (releases.length > 0) {
			releases.shift()?.();
			await settle();
		}
		expect(await Promise.all(results)).toEqual([10, 20, 30, 40, 50]);
		expect(started).toEqual([1, 2, 3, 4, 5]);
		expect(peak).toBe(2);
	});

	it("frees the slot of a task that fails", async () => {
		const limit = createLimiter(1);
		const failed = limit(async () => {
			throw new Error("boom");
		});
		await expect(failed).rejects.toThrow("boom");
		await expect(limit(async () => "next")).resolves.toBe("next");
	});

	it("rejects a concurrency that is not a positive integer", () => {
		expect(() => createLimiter(0)).toThrow(RangeError);
		expect(() => createLimiter(1.5)).toThrow(RangeError);
	});
});
