import { describe, expect, it } from "vitest";
import { epochClockFromStakingState } from "./epoch-clock";

const READ_AT = Date.UTC(2026, 9, 18, 12, 0, 0);

describe("epochClockFromStakingState", () => {
	it("starts the epoch when its change finished (Testnet, 2026-10-18)", () => {
		expect(
			epochClockFromStakingState(
				{
					epoch: 554,
					epoch_duration: "86400000",
					epoch_state: {
						$kind: "EpochChangeDone",
						EpochChangeDone: "1792277220923",
					},
				},
				READ_AT,
			),
		).toEqual({
			epoch: 554,
			epochStartMs: 1_792_277_220_923,
			epochDurationMs: 86_400_000,
		});
	});

	it("reads the epoch start kept by NextParamsSelected (Walrus Mainnet, 2026-10-18)", () => {
		expect(
			epochClockFromStakingState(
				{
					epoch: 41,
					epoch_duration: "1209600000",
					epoch_state: {
						$kind: "NextParamsSelected",
						NextParamsSelected: "1791299431297",
					},
				},
				READ_AT,
			),
		).toEqual({
			epoch: 41,
			epochStartMs: 1_791_299_431_297,
			epochDurationMs: 1_209_600_000,
		});
	});

	it("uses the read time while the epoch change is still syncing", () => {
		expect(
			epochClockFromStakingState(
				{
					epoch: 555,
					epoch_duration: "86400000",
					epoch_state: { $kind: "EpochChangeSync", EpochChangeSync: 120 },
				},
				READ_AT,
			).epochStartMs,
		).toBe(READ_AT);
	});
});
