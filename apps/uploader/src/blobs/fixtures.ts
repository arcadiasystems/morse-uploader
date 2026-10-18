/**
 * Builders for unit tests. Clocks use the live Testnet and Walrus Mainnet
 * values read on 2026-10-18 (PROTOCOL-NOTES section 5 for the durations).
 */
import type { BlobRecord } from "./blob-record";
import { type BlobRow, toBlobRows } from "./blob-row";
import type { EpochClock } from "./epoch-clock";

export const TESTNET_CLOCK: EpochClock = {
	epoch: 554,
	epochStartMs: 1_792_277_220_923,
	epochDurationMs: 86_400_000,
};

export const MAINNET_CLOCK: EpochClock = {
	epoch: 41,
	epochStartMs: 1_791_299_431_297,
	epochDurationMs: 1_209_600_000,
};

/** Twelve hours into the Testnet epoch above. */
export const TESTNET_NOW = TESTNET_CLOCK.epochStartMs + 43_200_000;

let nextId = 1;

export function blobRecord(overrides: Partial<BlobRecord> = {}): BlobRecord {
	const id = (nextId++).toString(16).padStart(64, "0");
	return {
		objectId: `0x${id}`,
		blobId: `blob${id.slice(-10)}`,
		name: null,
		size: 1_000n,
		encodedSize: 66_034_000n,
		deletable: true,
		registeredEpoch: 553,
		certifiedEpoch: 553,
		startEpoch: 553,
		endEpoch: 603,
		isQuilt: false,
		isEncrypted: false,
		contentType: null,
		encodingType: 1,
		...overrides,
	};
}

export function blobRow(
	overrides: Partial<BlobRecord> = {},
	clock: EpochClock = TESTNET_CLOCK,
	nowMs: number = TESTNET_NOW,
): BlobRow {
	const [row] = toBlobRows([blobRecord(overrides)], clock, nowMs);
	if (!row) throw new Error("toBlobRows returned no row.");
	return row;
}
