import type { WalrusClient } from "@mysten/walrus";
import type { NetworkClient } from "@/network/create-network-client";

/** Where the current Walrus epoch stands, read from the staking object. */
export interface EpochClock {
	epoch: number;
	/** Estimated start of the current epoch, in Unix milliseconds. */
	epochStartMs: number;
	/** 1 day on Testnet, 14 days on Walrus Mainnet (PROTOCOL-NOTES section 5). */
	epochDurationMs: number;
}

type StakingState = Awaited<ReturnType<WalrusClient["stakingState"]>>;

/**
 * The epoch clock from the live staking state. Testnet epochs drift from the
 * nominal schedule, so the start comes from `epoch_state`, never from
 * `first_epoch_start` (PROTOCOL-NOTES section 5):
 *
 * - `EpochChangeDone(t)`: the epoch change finished at `t`, seconds after the
 *   epoch began.
 * - `NextParamsSelected(t)`: carries the same `t`, "the start of the current
 *   epoch" (`staking_inner.move`).
 * - `EpochChangeSync`: the epoch has only just begun and the state holds no
 *   timestamp, so the read time stands in for its start.
 */
export function epochClockFromStakingState(
	state: Pick<StakingState, "epoch" | "epoch_duration" | "epoch_state">,
	readAtMs: number,
): EpochClock {
	const epochState = state.epoch_state;
	let epochStartMs: number;
	switch (epochState.$kind) {
		case "EpochChangeDone":
			epochStartMs = Number(epochState.EpochChangeDone);
			break;
		case "NextParamsSelected":
			epochStartMs = Number(epochState.NextParamsSelected);
			break;
		case "EpochChangeSync":
			epochStartMs = readAtMs;
			break;
	}
	return {
		epoch: state.epoch,
		epochStartMs,
		epochDurationMs: Number(state.epoch_duration),
	};
}

/** Reads the current epoch clock for the client's network. */
export async function readEpochClock(
	client: NetworkClient,
): Promise<EpochClock> {
	// The SDK memoizes the staking object for the client's lifetime. Resetting
	// its cache makes every read see the current epoch, which changes daily on
	// Testnet. Only the Walrus SDK's own cache is cleared.
	client.walrus.reset();
	const state = await client.walrus.stakingState();
	return epochClockFromStakingState(state, Date.now());
}
