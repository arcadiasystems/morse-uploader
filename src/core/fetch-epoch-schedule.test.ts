import { describe, expect, it, vi } from "vitest";
import { fetchEpochSchedule } from "./fetch-epoch-schedule.js";

describe("fetchEpochSchedule", () => {
	it("maps staking state to a numeric schedule", async () => {
		const source = {
			stakingState: vi.fn().mockResolvedValue({
				epoch: 7,
				epoch_duration: "86400000",
				first_epoch_start: "1000",
			}),
		};
		expect(await fetchEpochSchedule(source)).toEqual({
			currentEpoch: 7,
			epochDurationMs: 86_400_000,
			firstEpochStartMs: 1000,
		});
	});
});
