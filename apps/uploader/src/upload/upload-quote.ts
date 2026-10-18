import type { ObservedGas } from "@/network/networks";
import { entryNames } from "./publish-rules";
import {
	type BatchCost,
	batchCost,
	batchGas,
	type RelayTipConfig,
	relayTipMax,
	type SignaturePlan,
	signatureCount,
	type WalrusPricing,
} from "./upload-cost";
import type { UploadPlan } from "./upload-plan";

export interface Quote {
	cost: BatchCost;
	signatures: SignaturePlan;
	/** Signatures, which is also the number of transactions. */
	signatureTotal: number;
	/** `sendTip: { max }` for each item, in plan order. */
	tipMaxMist: readonly number[];
}

export interface QuoteInput {
	plan: UploadPlan;
	epochs: number;
	publishing: boolean;
	pricing: WalrusPricing;
	tip: RelayTipConfig | null;
}

/** The WAL, tips and signatures of an upload, from the plan and live prices. */
export function buildQuote({
	plan,
	epochs,
	publishing,
	pricing,
	tip,
}: QuoteInput): Quote {
	const cost = batchCost(
		plan.items.map((item) => item.uploadBytes),
		epochs,
		pricing,
		tip,
	);
	const signatures: SignaturePlan = {
		items: plan.items.length,
		encryptedItems: plan.items.filter(
			(item) => item.kind === "blob" && item.seal !== null,
		).length,
		entries: publishing ? entryNames(plan).length : 0,
	};
	return {
		cost,
		signatures,
		signatureTotal: signatureCount(signatures),
		tipMaxMist: cost.items.map((item) => relayTipMax(item.tipMist)),
	};
}

/**
 * Net gas for every transaction of the upload: the simulated registers,
 * and observed figures for what cannot be simulated before it is signed.
 */
export function quoteGas(
	quote: Quote,
	registerMist: readonly bigint[],
	observed: ObservedGas,
): bigint {
	return batchGas(
		{
			registerMist,
			certifyMist: observed.certifyMist,
			entryMist: observed.entryMist,
			recipientFileMist: observed.recipientFileMist ?? 0n,
		},
		quote.signatures,
	);
}

/**
 * Each item's share of the quote, for the queue's batch line: its storage
 * and write fee, its tip, its register gas, a certify, and its Morse
 * transactions. Gas is `null` until the registers are simulated.
 */
export function itemEstimates(
	quote: Quote,
	plan: UploadPlan,
	publishing: boolean,
	registerMist: readonly bigint[] | null,
	observed: ObservedGas,
): { walFrost: bigint; suiMist: bigint | null }[] {
	return plan.items.map((item, index) => {
		const cost = quote.cost.items[index];
		const register = registerMist?.[index];
		const walFrost = cost ? cost.storageFrost + cost.writeFrost : 0n;
		if (!cost || register === undefined) return { walFrost, suiMist: null };
		const encrypted = item.kind === "blob" && item.seal !== null;
		const entries = publishing
			? item.kind === "quilt"
				? item.patches.length
				: 1
			: 0;
		return {
			walFrost,
			suiMist:
				cost.tipMist +
				register +
				observed.certifyMist +
				(encrypted ? (observed.recipientFileMist ?? 0n) : 0n) +
				BigInt(entries) * observed.entryMist,
		};
	});
}
