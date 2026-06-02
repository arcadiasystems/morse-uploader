import type { EpochSchedule, WalrusEpochSource } from "../types.js";

/**
 * Read the Walrus epoch schedule from a client's staking state. The durations
 * arrive as numeric strings (ms); they are parsed to numbers here.
 */
export async function fetchEpochSchedule(
	source: WalrusEpochSource,
): Promise<EpochSchedule> {
	const state = await source.stakingState();
	return {
		currentEpoch: state.epoch,
		epochDurationMs: Number(state.epoch_duration),
		firstEpochStartMs: Number(state.first_epoch_start),
	};
}
