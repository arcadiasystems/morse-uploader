import type { BlobRow } from "@/blobs/blob-row";
import type { EpochClock } from "@/blobs/epoch-clock";
import { deleteBlocker } from "./delete-rules";
import { extendBlocker } from "./extend-rules";
import { verifyBlocker } from "./verify-rules";

/**
 * Which selected blobs each bulk action can take, and why the others are
 * left out. Each rule is the single-blob rule the inspector applies:
 * extend (Move `system_state_inner.move:390-427`), delete (`blob.move:236-
 * 247`), verify (PROTOCOL-NOTES section 8), share (section 10) and publish
 * to Morse (section 12).
 */
export type BulkAction = "extend" | "share" | "verify" | "publish" | "delete";

export type LeftOutReason =
	| "expired"
	| "registered"
	| "at-limit"
	| "permanent"
	| "too-large"
	| "encrypted"
	| "quilt";

export interface LeftOut {
	row: BlobRow;
	reason: LeftOutReason;
}

export interface Eligibility {
	eligible: BlobRow[];
	leftOut: LeftOut[];
}

/** Why one blob is left out of an action, or `null` when the action takes it. */
export function leftOutReason(
	action: BulkAction,
	row: BlobRow,
	clock: Pick<EpochClock, "epoch">,
	maxEpochsAhead: number,
): LeftOutReason | null {
	const { blob } = row;
	const expired = blob.endEpoch <= clock.epoch;
	switch (action) {
		case "extend":
			return extendBlocker(blob, clock, maxEpochsAhead)?.kind ?? null;
		case "delete":
			return deleteBlocker(blob, clock)?.kind ?? null;
		case "verify":
			return verifyBlocker(blob, expired)?.kind ?? null;
		case "share":
			if (expired) return "expired";
			return blob.certifiedEpoch === null ? "registered" : null;
		case "publish":
			if (blob.isEncrypted) return "encrypted";
			if (expired) return "expired";
			if (blob.certifiedEpoch === null) return "registered";
			if (!blob.deletable) return "permanent";
			return blob.isQuilt ? "quilt" : null;
	}
}

/** Splits the selection into the blobs an action takes and the ones it leaves out. */
export function bulkEligibility(
	action: BulkAction,
	rows: readonly BlobRow[],
	clock: Pick<EpochClock, "epoch">,
	maxEpochsAhead: number,
): Eligibility {
	const eligible: BlobRow[] = [];
	const leftOut: LeftOut[] = [];
	for (const row of rows) {
		const reason = leftOutReason(action, row, clock, maxEpochsAhead);
		if (reason === null) eligible.push(row);
		else leftOut.push({ row, reason });
	}
	return { eligible, leftOut };
}

/** A reason as a short phrase, for "3 left out: 2 storage ended, 1 permanent". */
export function leftOutText(
	reason: LeftOutReason,
	maxEpochsAhead: number,
): string {
	switch (reason) {
		case "expired":
			return "storage ended";
		case "registered":
			return "not certified yet";
		case "at-limit":
			return `already paid ${maxEpochsAhead} epochs ahead`;
		case "permanent":
			return "permanent, not deletable";
		case "too-large":
			return "too large to rebuild in the browser";
		case "encrypted":
			return "encrypted, with a RecipientFile policy Morse entries do not take";
		case "quilt":
			return "a quilt, whose files go into Morse from its inspector";
	}
}

/** Left-out blobs grouped by reason, most common first. */
export function groupLeftOut(
	leftOut: readonly LeftOut[],
): { reason: LeftOutReason; rows: BlobRow[] }[] {
	const groups = new Map<LeftOutReason, BlobRow[]>();
	for (const { row, reason } of leftOut) {
		const group = groups.get(reason);
		if (group) group.push(row);
		else groups.set(reason, [row]);
	}
	return [...groups]
		.map(([reason, rows]) => ({ reason, rows }))
		.sort((a, b) => b.rows.length - a.rows.length);
}
