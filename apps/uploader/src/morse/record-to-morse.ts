import { fromHex } from "@mysten/sui/utils";
import type { NetworkClient } from "@/network/create-network-client";
import type { NetworkId } from "@/network/networks";
import type { RecordPlan, TransferRecord } from "@/transfers/record-plan";
import {
	TransactionUnconfirmedError,
	type WalletExecutor,
} from "@/transfers/wallet-executor";
import { loadMorseSdk } from "./load-morse-sdk";
import { createMorseWalletAdapter } from "./morse-wallet-adapter";

/** Quilt patch ids are version 1 (`QuiltPatchId` in walrus-core). */
const QUILT_PATCH_VERSION = 1;

/** Which Morse transaction a record step was making. */
export type RecordTarget =
	| { kind: "recipient-file" }
	| { kind: "entry"; name: string };

/**
 * A Morse transaction was sent but its result could not be read. Running
 * the step again would make a second one, so the digest is checked first.
 */
export class RecordUnconfirmedError extends Error {
	readonly target: RecordTarget;
	readonly digest: string;

	constructor(target: RecordTarget, cause: TransactionUnconfirmedError) {
		super(cause.message, { cause });
		this.name = "RecordUnconfirmedError";
		this.target = target;
		this.digest = cause.digest;
	}
}

export interface RecordInput {
	executor: WalletExecutor;
	client: NetworkClient;
	network: NetworkId;
	blobId: string;
	blobObjectId: string;
	plan: RecordPlan;
	/** Transactions an earlier attempt already made; they are not repeated. */
	done: readonly TransferRecord[];
	onRecorded: (record: TransferRecord) => void;
}

/**
 * Makes an item's Morse transactions through morse-sdk 0.9.0, one wallet
 * signature each: the RecipientFile first, so an encrypted file can be
 * decrypted as soon as possible, then the entries in order.
 * @throws {RecordUnconfirmedError} When a transaction was sent but not confirmed.
 */
export async function recordToMorse({
	executor,
	client,
	network,
	blobId,
	blobObjectId,
	plan,
	done,
	onRecorded,
}: RecordInput): Promise<void> {
	const sdk = await loadMorseSdk();
	const config = sdk.morseConfig({ network });
	const adapter = createMorseWalletAdapter(sdk, executor, client);

	const { recipientFile, publish } = plan;
	if (
		recipientFile &&
		!done.some((record) => record.kind === "recipient-file")
	) {
		const prefix = recipientFile.sealIdPrefixHex;
		if (prefix === null)
			throw new Error(
				`${recipientFile.name} was never encrypted, so it has no access policy to create.`,
			);
		const created = await unconfirmedAs({ kind: "recipient-file" }, () =>
			sdk.createEncryptedRecipientFile(adapter, config, {
				blobId: sdk.toWalrusBlobId(blobId),
				blobObjectId: sdk.toBlobObjectId(blobObjectId),
				name: recipientFile.name,
				contentType: recipientFile.contentType,
				size: recipientFile.size,
				recipients: [adapter.address],
				sealIdPrefix: fromHex(prefix),
			}),
		);
		onRecorded({
			kind: "recipient-file",
			fileId: created.fileId,
			digest: created.digest,
		});
	}

	if (!publish) return;
	const recorded = new Set(
		done.flatMap((record) => (record.kind === "entry" ? [record.name] : [])),
	);
	for (const entry of publish.entries) {
		if (recorded.has(entry.name)) continue;
		const added = await unconfirmedAs({ kind: "entry", name: entry.name }, () =>
			sdk.addEntry(adapter, config, {
				publicationId: sdk.toPublicationId(publish.target.publicationId),
				publisherCapId: sdk.toPublisherCapId(publish.target.publisherCapId),
				collectionName: publish.target.collectionName,
				name: entry.name,
				blobObjectId: sdk.toBlobObjectId(blobObjectId),
				contentType: entry.contentType,
				...(entry.patch
					? {
							quiltPatchId: sdk.encodeQuiltPatchId({
								quiltBlobId: sdk.toWalrusBlobId(blobId),
								version: QUILT_PATCH_VERSION,
								startIndex: entry.patch.startIndex,
								endIndex: entry.patch.endIndex,
							}),
						}
					: {}),
			}),
		);
		onRecorded({
			kind: "entry",
			entryId: added.entryId,
			name: entry.name,
			digest: added.digest,
		});
	}
}

/**
 * Reads back a record transaction that was sent but not confirmed. A
 * RecipientFile's id is in the transaction's created objects. An entry's id
 * is a Move return value that only a simulation before signing shows, so it
 * stays unknown.
 * @throws {TransactionFailedError} When the transaction failed on chain: the record can be made again.
 * @throws {TransactionUnconfirmedError} When its result still cannot be read.
 */
export async function confirmRecord(
	executor: WalletExecutor,
	target: RecordTarget,
	digest: string,
): Promise<TransferRecord> {
	const executed = await executor.confirm(digest);
	if (target.kind === "entry")
		return { kind: "entry", entryId: null, name: target.name, digest };
	const fileId = executed.effects.changedObjects.find(
		(change) =>
			change.idOperation === "Created" &&
			executed.objectTypes[change.objectId]?.endsWith(
				"::recipient_file::RecipientFile",
			),
	)?.objectId;
	if (!fileId)
		throw new Error(`Transaction ${digest} created no RecipientFile.`);
	return { kind: "recipient-file", fileId, digest };
}

async function unconfirmedAs<T>(
	target: RecordTarget,
	make: () => Promise<T>,
): Promise<T> {
	try {
		return await make();
	} catch (error) {
		if (error instanceof TransactionUnconfirmedError)
			throw new RecordUnconfirmedError(target, error);
		throw error;
	}
}
