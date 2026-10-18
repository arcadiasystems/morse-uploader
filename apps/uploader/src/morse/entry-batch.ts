import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";

/**
 * Several Morse entries in one transaction. morse-sdk 0.9.0's `addEntry`
 * adds one entry per transaction, and its PTB builders (`ptb/*`) are not
 * exported. This builds the same Move call it builds, once per entry, from
 * the on-chain signature (PROTOCOL-NOTES section 12):
 *
 *   publication::add_entry_to_collection(&mut Publication, &PublisherCap,
 *     String collection, String name, &Blob, Option<vector<u8>> patch_id,
 *     String content_type, bool encrypted, u8 access_policy,
 *     Option<vector<u8>> seal_id, &mut TxContext): u64
 *
 * Entries are public and unencrypted, with no seal id, exactly as `addEntry`
 * writes them. The Blob is passed by reference and stays in the wallet.
 */

/** morse-sdk's `AccessPolicy.Public` as Move's u8 (`accessPolicyToU8`). */
export const ACCESS_POLICY_PUBLIC = 0;

/**
 * Entries per transaction. Each is one Move call with seven pure inputs and
 * a table write; 25 keeps a transaction far below Sui's input and command
 * limits and its gas within what a wallet shows in one prompt.
 */
export const MAX_ENTRIES_PER_TRANSACTION = 25;

/** Where the entries go: one publication's collection, through one PublisherCap. */
export interface EntryCollection {
	/** The Morse package to call: `morseConfig({ network }).packageId`. */
	packageId: string;
	publicationId: string;
	publisherCapId: string;
	collectionName: string;
}

/** One entry: a blob the wallet owns, or one file of a quilt by its 37-byte patch id. */
export interface EntryInput {
	name: string;
	contentType: string;
	blobObjectId: string;
	/** The raw 37-byte quilt patch id; `null` for a standalone blob. */
	quiltPatchId: Uint8Array | null;
}

const OPTION_BYTES = bcs.option(bcs.vector(bcs.u8()));

/**
 * One transaction adding every entry, in order. Command `i` returns entry
 * `i`'s new id, which a simulation reads before the wallet is asked.
 * @throws {RangeError} When there are no entries or more than one transaction holds.
 */
export function buildAddEntriesTransaction(
	collection: EntryCollection,
	entries: readonly EntryInput[],
): Transaction {
	if (entries.length === 0 || entries.length > MAX_ENTRIES_PER_TRANSACTION)
		throw new RangeError(
			`One transaction adds 1 to ${MAX_ENTRIES_PER_TRANSACTION} entries, not ${entries.length}.`,
		);
	const transaction = new Transaction();
	const publication = transaction.object(collection.publicationId);
	const publisherCap = transaction.object(collection.publisherCapId);
	for (const entry of entries)
		transaction.moveCall({
			target: `${collection.packageId}::publication::add_entry_to_collection`,
			arguments: [
				publication,
				publisherCap,
				transaction.pure.string(collection.collectionName),
				transaction.pure.string(entry.name),
				transaction.object(entry.blobObjectId),
				transaction.pure(
					OPTION_BYTES.serialize(
						entry.quiltPatchId === null ? null : Array.from(entry.quiltPatchId),
					),
				),
				transaction.pure.string(entry.contentType),
				transaction.pure.bool(false),
				transaction.pure.u8(ACCESS_POLICY_PUBLIC),
				transaction.pure(OPTION_BYTES.serialize(null)),
			],
		});
	return transaction;
}
