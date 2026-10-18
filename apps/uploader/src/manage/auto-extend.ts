import type { BlobRow } from "@/blobs/blob-row";
import type { EpochClock } from "@/blobs/epoch-clock";
import {
	type ExtendItem,
	extendBlocker,
	extendFrost,
	extendHeadroom,
} from "./extend-rules";

/**
 * Auto-extend without a backend (PROTOCOL-NOTES section 9, option 1). There
 * is no on-chain scheduler, so it only runs while Morse Uploader is open:
 * on load and on a timer, the app finds blobs close to expiry and asks the
 * wallet to sign one extend transaction for them. The WAL cap is enforced
 * here: the app never builds a renewal that would take the total it has
 * spent past the cap. Nothing happens while the app is closed, and a blob
 * that reaches its end epoch can no longer be extended.
 */

/** One profile's auto-extend setting, kept in this browser. */
export interface AutoExtendSettings {
	enabled: boolean;
	/** The most WAL auto-extend may spend in total, in FROST. */
	capFrost: bigint;
	/** What auto-extend has spent against the cap so far, in FROST. */
	spentFrost: bigint;
	/** A blob is renewed once this many epochs or fewer are left. */
	renewWithinEpochs: number;
	/** Epochs each renewal adds. */
	extendByEpochs: number;
}

/** The cap starts at 0: nothing renews until the viewer chooses what it may spend. */
export const DEFAULT_AUTO_EXTEND: AutoExtendSettings = {
	enabled: false,
	capFrost: 0n,
	spentFrost: 0n,
	renewWithinEpochs: 2,
	extendByEpochs: 5,
};

/** Bounds for the two epoch settings. Both networks cap storage at 53 epochs ahead (notes section 5). */
export const RENEW_WITHIN_RANGE = { min: 1, max: 10 } as const;
export const EXTEND_BY_RANGE = { min: 1, max: 53 } as const;

/** Extends per transaction: each is a coin split and a Move call, far below Sui's command limit. */
export const MAX_EXTENDS_PER_TRANSACTION = 50;

export type AutoExtendPlan =
	| { kind: "off" }
	| { kind: "nothing-due" }
	/** Blobs are due, but none fits in what is left of the cap. */
	| { kind: "cap-reached"; due: number; remainingFrost: bigint }
	| {
			kind: "renew";
			items: readonly ExtendItem[];
			totalFrost: bigint;
			/** Due blobs left out because the cap (or one transaction's size) does not reach them. */
			leftOut: number;
			remainingFrost: bigint;
	  };

export interface AutoExtendInput {
	rows: readonly BlobRow[];
	clock: Pick<EpochClock, "epoch">;
	settings: AutoExtendSettings;
	storagePricePerUnit: bigint;
	maxEpochsAhead: number;
}

/**
 * Which blobs one auto-extend cycle renews, for how long, and at what cost.
 * Due blobs are certified, still live at the current epoch, within
 * `renewWithinEpochs` of their end and below the 53-epoch limit. The
 * soonest to expire go first; a blob whose renewal would pass the cap is
 * left out, and cheaper ones after it can still fit.
 */
export function planAutoExtend({
	rows,
	clock,
	settings,
	storagePricePerUnit,
	maxEpochsAhead,
}: AutoExtendInput): AutoExtendPlan {
	if (!settings.enabled) return { kind: "off" };
	const due = rows
		.filter(
			(row) =>
				extendBlocker(row.blob, clock, maxEpochsAhead) === null &&
				row.blob.endEpoch - clock.epoch <= settings.renewWithinEpochs,
		)
		.sort(
			(a, b) =>
				a.blob.endEpoch - b.blob.endEpoch ||
				a.blob.objectId.localeCompare(b.blob.objectId),
		);
	if (due.length === 0) return { kind: "nothing-due" };

	const remainingFrost =
		settings.capFrost > settings.spentFrost
			? settings.capFrost - settings.spentFrost
			: 0n;
	const items: ExtendItem[] = [];
	let totalFrost = 0n;
	for (const row of due) {
		if (items.length === MAX_EXTENDS_PER_TRANSACTION) break;
		const epochs = Math.min(
			settings.extendByEpochs,
			extendHeadroom(row.blob.endEpoch, clock.epoch, maxEpochsAhead),
		);
		const frost = extendFrost(
			row.blob.encodedSize,
			epochs,
			storagePricePerUnit,
		);
		if (totalFrost + frost > remainingFrost) continue;
		totalFrost += frost;
		items.push({
			objectId: row.blob.objectId,
			epochs,
			frost,
			newEndEpoch: row.blob.endEpoch + epochs,
		});
	}
	if (items.length === 0)
		return { kind: "cap-reached", due: due.length, remainingFrost };
	return {
		kind: "renew",
		items,
		totalFrost,
		leftOut: due.length - items.length,
		remainingFrost,
	};
}

/**
 * A key for one cycle's proposal. The runner asks the wallet once per key in
 * a session, so a declined or failed renewal is not asked again on every
 * timer tick.
 */
export function proposalKey(
	epoch: number,
	items: readonly ExtendItem[],
): string {
	return `${epoch}:${items.map((item) => `${item.objectId}+${item.epochs}`).join(",")}`;
}

export function serializeAutoExtend(settings: AutoExtendSettings): string {
	return JSON.stringify({
		enabled: settings.enabled,
		capFrost: settings.capFrost.toString(),
		spentFrost: settings.spentFrost.toString(),
		renewWithinEpochs: settings.renewWithinEpochs,
		extendByEpochs: settings.extendByEpochs,
	});
}

/** The stored setting, or `null` when it is missing a field or out of range. */
export function parseAutoExtend(raw: string): AutoExtendSettings | null {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch (error) {
		// Stored text that is not JSON was written by something else: ignore it.
		if (error instanceof SyntaxError) return null;
		throw error;
	}
	if (typeof value !== "object" || value === null) return null;
	const record = value as Record<string, unknown>;
	const capFrost = parseFrost(record.capFrost);
	const spentFrost = parseFrost(record.spentFrost);
	const renewWithinEpochs = record.renewWithinEpochs;
	const extendByEpochs = record.extendByEpochs;
	if (
		typeof record.enabled !== "boolean" ||
		capFrost === null ||
		spentFrost === null ||
		!isEpochCount(renewWithinEpochs, RENEW_WITHIN_RANGE.max) ||
		!isEpochCount(extendByEpochs, EXTEND_BY_RANGE.max)
	)
		return null;
	return {
		enabled: record.enabled,
		capFrost,
		spentFrost,
		renewWithinEpochs,
		extendByEpochs,
	};
}

function parseFrost(value: unknown): bigint | null {
	return typeof value === "string" && /^\d{1,30}$/.test(value)
		? BigInt(value)
		: null;
}

function isEpochCount(value: unknown, max: number): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= 1 &&
		value <= max
	);
}
