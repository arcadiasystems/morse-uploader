import { encodedBlobSize, storageUnits } from "./encoded-size";

/**
 * The cost of an upload, from PROTOCOL-NOTES section 4. WAL (FROST): storage
 * is `units × storage price × epochs`, the write fee `units × write price`,
 * both on the encoded size. SUI (MIST): the relay tip per upload, plus gas.
 */

/** Live prices from the Walrus system object, in FROST per storage unit. */
export interface WalrusPricing {
	storagePricePerUnit: bigint;
	writePricePerUnit: bigint;
	nShards: number;
}

/** What the upload relay asks per upload (`/v1/tip-config`). */
export type RelayTipKind =
	| { kind: "const"; mist: bigint }
	| { kind: "linear"; baseMist: bigint; perEncodedKibMist: bigint };

export interface RelayTipConfig {
	address: string;
	tip: RelayTipKind;
}

export interface ItemCost {
	encodedSize: bigint;
	units: bigint;
	storageFrost: bigint;
	writeFrost: bigint;
	/** 0 when the relay asks no tip. */
	tipMist: bigint;
}

/** The relay tip for one upload: computed on the encoded size, not the file size. */
export function relayTip(
	config: RelayTipConfig | null,
	encodedSize: bigint,
): bigint {
	if (config === null) return 0n;
	const { tip } = config;
	if (tip.kind === "const") return tip.mist;
	return tip.baseMist + tip.perEncodedKibMist * ((encodedSize + 1023n) / 1024n);
}

/**
 * The most tip the SDK may send, passed as `sendTip: { max }`: the quoted
 * tip plus a quarter, so a small relay change still goes through but a
 * large one stops before anything is signed.
 */
export function relayTipMax(tipMist: bigint): number {
	return Number(tipMist + (tipMist + 3n) / 4n);
}

export function itemCost(
	uploadBytes: number,
	epochs: number,
	pricing: WalrusPricing,
	tipConfig: RelayTipConfig | null,
): ItemCost {
	const encodedSize = encodedBlobSize(uploadBytes, pricing.nShards);
	const units = storageUnits(encodedSize);
	return {
		encodedSize,
		units,
		storageFrost: units * pricing.storagePricePerUnit * BigInt(epochs),
		writeFrost: units * pricing.writePricePerUnit,
		tipMist: relayTip(tipConfig, encodedSize),
	};
}

/** What one upload batch asks the wallet to sign. */
export interface SignaturePlan {
	/** Blobs and quilts: one register each. */
	items: number;
	/** Encrypted files: one Morse RecipientFile each, their Seal access policy. */
	encryptedItems: number;
	/** Morse entries to add: one `addEntry` each. */
	entries: number;
}

/**
 * Certifies per transaction. Each carries a storage certificate of a few
 * hundred bytes; a hundred stay far below Sui's 128 KiB transaction limit.
 */
export const MAX_CERTIFIES_PER_TRANSACTION = 100;

/** Certify transactions for `items` items: one per hundred. */
export function certifyTransactions(items: number): number {
	return Math.ceil(items / MAX_CERTIFIES_PER_TRANSACTION);
}

/**
 * Signatures for a batch through the relay (PROTOCOL-NOTES section 6): one
 * register per item, because the relay reads one tip per transaction; one
 * certify for the batch (one per hundred items); one transaction per
 * RecipientFile and per Morse entry, which morse-sdk 0.9.0 builds and
 * signs on its own.
 */
export function signatureCount({
	items,
	encryptedItems,
	entries,
}: SignaturePlan): number {
	return items + certifyTransactions(items) + encryptedItems + entries;
}

/** Gas observed or simulated for each transaction kind, in MIST. */
export interface GasEstimate {
	/** Simulated register transaction of each item, in plan order. */
	registerMist: readonly bigint[];
	/** One certify, observed on chain; the batch certify holds one per item. */
	certifyMist: bigint;
	entryMist: bigint;
	recipientFileMist: bigint;
}

/** Net gas for the batch: every register, a certify per item, and the record transactions. */
export function batchGas(gas: GasEstimate, plan: SignaturePlan): bigint {
	const registers = gas.registerMist.reduce((total, mist) => total + mist, 0n);
	return (
		registers +
		gas.certifyMist * BigInt(plan.items) +
		gas.recipientFileMist * BigInt(plan.encryptedItems) +
		gas.entryMist * BigInt(plan.entries)
	);
}

export interface BatchCost {
	items: readonly ItemCost[];
	encodedSize: bigint;
	storageFrost: bigint;
	writeFrost: bigint;
	walFrost: bigint;
	tipMist: bigint;
}

export function batchCost(
	uploadBytes: readonly number[],
	epochs: number,
	pricing: WalrusPricing,
	tipConfig: RelayTipConfig | null,
): BatchCost {
	const items = uploadBytes.map((bytes) =>
		itemCost(bytes, epochs, pricing, tipConfig),
	);
	const total = (pick: (item: ItemCost) => bigint) =>
		items.reduce((sum, item) => sum + pick(item), 0n);
	const storageFrost = total((item) => item.storageFrost);
	const writeFrost = total((item) => item.writeFrost);
	return {
		items,
		encodedSize: total((item) => item.encodedSize),
		storageFrost,
		writeFrost,
		walFrost: storageFrost + writeFrost,
		tipMist: total((item) => item.tipMist),
	};
}
