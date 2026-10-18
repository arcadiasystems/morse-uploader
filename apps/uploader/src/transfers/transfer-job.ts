import type { NetworkId } from "@/network/networks";
import type { PublishChoice } from "@/upload/publish-rules";
import type { PlanItem } from "@/upload/upload-plan";

/** What the sheet quoted for an item: WAL for storage and the write fee, SUI for tip and gas. */
export interface TransferEstimate {
	walFrost: bigint;
	/** `null` when gas could not be simulated. */
	suiMist: bigint | null;
}

/** One item of a confirmed upload sheet. */
export interface TransferJob {
	plan: PlanItem;
	epochs: number;
	deletable: boolean;
	/** `sendTip: { max }` for this item's relay upload, in MIST. */
	tipMaxMist: number;
	publish: PublishChoice | null;
	estimate: TransferEstimate;
}

/** A confirmed upload sheet: its items, for one wallet on one network. */
export interface TransferBatch {
	network: NetworkId;
	owner: string;
	jobs: readonly TransferJob[];
}
