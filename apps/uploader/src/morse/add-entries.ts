import { bcs } from "@mysten/sui/bcs";
import { inBatches } from "@/lib/batches";
import type { NetworkClient } from "@/network/create-network-client";
import type { NetworkId } from "@/network/networks";
import type { WalletExecutor } from "@/transfers/wallet-executor";
import type { PublishChoice } from "@/upload/publish-rules";
import {
	buildAddEntriesTransaction,
	MAX_ENTRIES_PER_TRANSACTION,
} from "./entry-batch";
import { loadMorseSdk } from "./load-morse-sdk";
import { createMorseWalletAdapter } from "./morse-wallet-adapter";

/** One entry to add: a blob the wallet owns, or a quilt file by its patch id. */
export interface PublishEntry {
	name: string;
	contentType: string;
	blobObjectId: string;
	/** A quilt file's patch id as the aggregator lists it, URL-safe base64; `null` for a standalone blob. */
	patchId: string | null;
}

/** One signed transaction's entries, in the order they were given. */
export interface AddedBatch {
	digest: string;
	entryIds: readonly number[];
	/** How many entries came before this batch. */
	offset: number;
}

export interface AddEntriesInput {
	executor: WalletExecutor;
	client: NetworkClient;
	network: NetworkId;
	choice: PublishChoice;
	entries: readonly PublishEntry[];
	/** Called after each signed batch, so the caller can show progress and keep what is done. */
	onAdded: (batch: AddedBatch) => void;
	signal?: AbortSignal;
}

/**
 * Adds entries to one Morse collection, at most 25 per transaction, so the
 * wallet asks once per 25. Each transaction is simulated first: that reads
 * the new entry ids (as morse-sdk's `addEntry` does) and stops a failing
 * transaction, with Morse's abort reason, before the wallet is asked.
 * Patch ids are decoded with morse-sdk, which checks their 37 bytes.
 * @throws The first failure; batches signed before it were reported to `onAdded`.
 */
export async function addEntries({
	executor,
	client,
	network,
	choice,
	entries,
	onAdded,
	signal,
}: AddEntriesInput): Promise<void> {
	const sdk = await loadMorseSdk();
	const adapter = createMorseWalletAdapter(sdk, executor, client);
	const collection = {
		packageId: sdk.morseConfig({ network }).packageId,
		publicationId: choice.publicationId,
		publisherCapId: choice.publisherCapId,
		collectionName: choice.collectionName,
	};
	let offset = 0;
	for (const batch of inBatches(entries, MAX_ENTRIES_PER_TRANSACTION)) {
		const transaction = buildAddEntriesTransaction(
			collection,
			batch.map((entry) => ({
				name: entry.name,
				contentType: entry.contentType,
				blobObjectId: entry.blobObjectId,
				quiltPatchId:
					entry.patchId === null
						? null
						: sdk.quiltPatchIdFromString(entry.patchId),
			})),
		);
		const returned = await adapter.simulateTransaction(transaction, signal);
		const entryIds = batch.map((_, index) => {
			const bytes = returned[index]?.[0];
			if (!bytes)
				throw new Error(
					`The simulation returned no entry id for ${batch[index]?.name ?? "an entry"}.`,
				);
			return Number(bcs.u64().parse(bytes));
		});
		const receipt = await adapter.signAndExecuteTransaction(
			transaction,
			signal,
		);
		onAdded({ digest: receipt.digest, entryIds, offset });
		offset += batch.length;
	}
}
