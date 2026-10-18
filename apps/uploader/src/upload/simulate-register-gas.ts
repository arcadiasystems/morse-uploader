import { Transaction } from "@mysten/sui/transactions";
import { createLimiter } from "@/lib/create-limiter";
import type { NetworkClient } from "@/network/create-network-client";
import type { NetworkId } from "@/network/networks";
import { createWriteClient } from "@/transfers/create-write-client";

export interface RegisterShape {
	attributes: Readonly<Record<string, string>>;
	/** The relay tip the quote shows for this item, in MIST. */
	tipMaxMist: number;
}

export interface RegisterGasInput {
	client: NetworkClient;
	network: NetworkId;
	owner: string;
	epochs: number;
	deletable: boolean;
	items: readonly RegisterShape[];
	signal: AbortSignal;
}

/** Simulations at once; the rest wait. */
const CONCURRENCY = 4;
/** A stand-in body: register gas does not depend on the blob's size. */
const STAND_IN = new Uint8Array([0]);

/**
 * The net gas of each item's register transaction, from simulating the
 * transaction the upload will sign (PROTOCOL-NOTES section 4): the relay
 * tip and its auth payload, `reserve_space`, `register_blob` with the item's
 * attributes, period and deletable flag, and the transfer to the owner.
 *
 * The blob id must be derived from the bytes' encoding, so the simulation
 * registers a 1-byte stand-in instead of the file. Register gas does not
 * depend on the size: the Blob and Storage objects have fixed-width fields.
 * A simulation also fails when the wallet cannot pay, which surfaces here
 * before anything is signed.
 * @throws {Error} When a simulation fails or the wallet cannot pay.
 */
export async function simulateRegisterGas({
	client,
	network,
	owner,
	epochs,
	deletable,
	items,
	signal,
}: RegisterGasInput): Promise<bigint[]> {
	if (items.length === 0) return [];
	const tipMaxMist = Math.max(...items.map((item) => item.tipMaxMist));
	const writer = createWriteClient({ network, tipMaxMist });
	const metadata = await writer.computeBlobMetadata({ bytes: STAND_IN });
	const blobDigest = await metadata.blobDigest();
	const limit = createLimiter(CONCURRENCY);

	return Promise.all(
		items.map((item) =>
			limit(async () => {
				signal.throwIfAborted();
				const transaction = new Transaction();
				transaction.setSender(owner);
				transaction.add(
					writer.sendUploadRelayTip({
						size: STAND_IN.length,
						blobDigest,
						nonce: metadata.nonce,
					}),
				);
				transaction.transferObjects(
					[
						writer.registerBlob({
							size: STAND_IN.length,
							epochs,
							blobId: metadata.blobId,
							rootHash: metadata.rootHash,
							deletable,
							attributes: { ...item.attributes },
						}),
					],
					owner,
				);
				const result = await client.core.simulateTransaction({
					transaction,
					include: { effects: true },
					signal,
				});
				if (result.$kind === "FailedTransaction")
					throw new Error(
						result.FailedTransaction.status.error?.message ??
							"The register transaction would fail.",
					);
				const gas = result.Transaction.effects.gasUsed;
				return (
					BigInt(gas.computationCost) +
					BigInt(gas.storageCost) -
					BigInt(gas.storageRebate)
				);
			}),
		),
	);
}
