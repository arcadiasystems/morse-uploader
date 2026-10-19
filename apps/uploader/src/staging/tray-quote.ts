import { allFiles, type LocalLibrary } from "@/local/local-library";
import type { PublishTarget } from "@/morse/read-publish-targets";
import type { NetworkConfig } from "@/network/networks";
import type { TransferBatch } from "@/transfers/transfer-job";
import { type PeriodOption, periodOptions } from "@/upload/periods";
import {
	choiceKey,
	collectionMode,
	type PublishBlocker,
	type PublishChoice,
	publishBlocker,
	publishChoices,
} from "@/upload/publish-rules";
import { buildUploadPlan, type UploadPlan } from "@/upload/upload-plan";
import { buildQuote, itemEstimates, type Quote } from "@/upload/upload-quote";
import type { QuoteInputs } from "@/upload/use-upload-quote";
import type { KeepChoice, TraySettings } from "./tray-settings";

/** Everything the tray shows and sends, derived from what is staged and the prices. */
export interface TrayQuote {
	plan: UploadPlan;
	periods: readonly PeriodOption[];
	/** What "keep for" stands at: the setting, or the first period that fits. */
	keep: KeepChoice | null;
	/** `null` when the chosen period does not fit within the epoch limit now. */
	epochs: number | null;
	/** Encryption is on and the network offers it. */
	sealing: boolean;
	blocker: PublishBlocker | null;
	/** The collection kind every item fits, or `null` when quilts and blobs mix. */
	collection: "blob" | "quilt" | null;
	/** Where the wallet can publish this upload, once its targets are read. */
	choices: readonly PublishChoice[];
	/** The chosen publication and collection, or the first one. */
	choice: PublishChoice | null;
	/** Publishing is on, allowed for this upload, and has somewhere to go. */
	publishing: boolean;
	/** `null` while nothing can go up or no period fits. */
	quote: Quote | null;
}

export interface TrayQuoteInput {
	/** The staged roots that still have their bytes. */
	library: LocalLibrary;
	settings: TraySettings;
	inputs: QuoteInputs;
	network: NetworkConfig;
	/** When `inputs` were read: the moment periods are mapped to epochs from. */
	pricedAtMs: number;
	/** The wallet's publications and collections; `null` until they are read. */
	publishTargets: readonly PublishTarget[] | null;
}

/**
 * The tray's plan and quote, as phase 3's sheet derived them: one quilt
 * per folder or one blob per file (always one blob per file when Seal is
 * on), the period in epochs, where it can also publish, and the
 * itemised cost and signature count from the live prices.
 */
export function quoteTray({
	library,
	settings,
	inputs,
	network,
	pricedAtMs,
	publishTargets,
}: TrayQuoteInput): TrayQuote {
	const sealing =
		settings.encrypt &&
		network.seal.kind === "available" &&
		inputs.seal !== null;
	const plan = buildUploadPlan({
		library,
		selected: new Set(allFiles(library).map((file) => file.id)),
		mode: settings.mode,
		seal: sealing ? inputs.seal : null,
		nShards: inputs.pricing.nShards,
	});
	const periods = periodOptions(
		network.id,
		inputs.clock,
		network.maxEpochsAhead,
		pricedAtMs,
	);
	const firstFit = periods.find((period) => period.fits);
	const keep: KeepChoice | null =
		settings.keep ?? (firstFit ? { kind: "period", id: firstFit.id } : null);
	const epochs = epochsFor(keep, periods, network.maxEpochsAhead);
	const blocker = publishBlocker(plan, {
		encrypt: sealing,
		deletable: settings.deletable,
	});
	const collection = collectionMode(plan);
	const choices =
		publishTargets && collection
			? publishChoices(publishTargets, collection)
			: [];
	const choice =
		choices.find((option) => choiceKey(option) === settings.publishTo) ??
		choices[0] ??
		null;
	const publishing = settings.publish && blocker === null && choice !== null;
	const quote =
		epochs !== null && plan.items.length > 0
			? buildQuote({
					plan,
					epochs,
					publishing,
					pricing: inputs.pricing,
					tip: inputs.tip,
				})
			: null;
	return {
		plan,
		periods,
		keep,
		epochs,
		sealing,
		blocker,
		collection,
		choices,
		choice,
		publishing,
		quote,
	};
}

function epochsFor(
	keep: KeepChoice | null,
	periods: readonly PeriodOption[],
	maxEpochsAhead: number,
): number | null {
	if (keep === null) return null;
	if (keep.kind === "epochs")
		return Math.min(maxEpochsAhead, Math.max(1, keep.epochs));
	const period = periods.find((option) => option.id === keep.id);
	return period?.fits ? period.epochs : null;
}

/** What a price check compares: the period, the WAL, the tip and the signatures. */
export interface QuotedTerms {
	epochs: number | null;
	walFrost: bigint | null;
	tipMist: bigint | null;
	signatures: number | null;
}

export type PriceCheck =
	| { kind: "same" }
	| { kind: "changed"; before: QuotedTerms; after: QuotedTerms };

export function quotedTerms(tray: TrayQuote): QuotedTerms {
	return {
		epochs: tray.epochs,
		walFrost: tray.quote?.cost.walFrost ?? null,
		tipMist: tray.quote?.cost.tipMist ?? null,
		signatures: tray.quote?.signatureTotal ?? null,
	};
}

/**
 * The prices are read again right before signing (the handover's build
 * notes): a price vote, a new relay tip or an epoch change since the tray
 * opened changes what the user pays. Sign and send goes ahead only when
 * the terms the user saw still hold; otherwise the tray shows the new ones
 * and asks again.
 */
export function checkPrice(shown: TrayQuote, fresh: TrayQuote): PriceCheck {
	const before = quotedTerms(shown);
	const after = quotedTerms(fresh);
	const same =
		before.epochs === after.epochs &&
		before.walFrost === after.walFrost &&
		before.tipMist === after.tipMist &&
		before.signatures === after.signatures;
	return same ? { kind: "same" } : { kind: "changed", before, after };
}

export interface TrayBatchInput {
	tray: TrayQuote;
	network: NetworkConfig;
	/** The normalized address that signs. */
	owner: string;
	deletable: boolean;
	/** Each item's simulated register gas, in plan order; `null` while not simulated. */
	registerMist: readonly bigint[] | null;
}

/**
 * What Sign and send queues: one transfer job per item of the plan, with
 * the period, the tip ceiling, the Morse target and each item's share of
 * the quote. `null` when nothing can go up.
 */
export function trayBatch({
	tray,
	network,
	owner,
	deletable,
	registerMist,
}: TrayBatchInput): TransferBatch | null {
	const { plan, quote, epochs, publishing, choice } = tray;
	if (!quote || epochs === null || plan.items.length === 0) return null;
	const estimates = itemEstimates(
		quote,
		plan,
		publishing,
		registerMist !== null && registerMist.length === plan.items.length
			? registerMist
			: null,
		network.observedGas,
	);
	return {
		network: network.id,
		owner,
		jobs: plan.items.map((item, index) => ({
			plan: item,
			epochs,
			deletable,
			tipMaxMist: quote.tipMaxMist[index] ?? 0,
			publish: publishing ? choice : null,
			estimate: estimates[index] ?? { walFrost: 0n, suiMist: null },
		})),
	};
}
