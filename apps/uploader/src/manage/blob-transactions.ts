import { Transaction } from "@mysten/sui/transactions";
import type { NetworkClient } from "@/network/create-network-client";

/**
 * The transactions the drawer signs, built with `@mysten/walrus` 1.2.35
 * (PROTOCOL-NOTES section 8), and their simulation before signing.
 */

/** A simulated transaction's net gas: computation plus storage minus the rebate. Negative is a net rebate. */
export interface SimulatedGas {
	netMist: bigint;
}

/** The transaction would fail on chain; nothing was signed. */
export class SimulationFailedError extends Error {
	constructor(reason: string) {
		super(`The transaction would fail: ${reason}`);
		this.name = "SimulationFailedError";
	}
}

/**
 * The current storage price, in FROST per unit per epoch. The SDK's Walrus
 * cache is cleared first, so this is the price on chain now.
 */
export async function readStoragePrice(client: NetworkClient): Promise<bigint> {
	client.walrus.reset();
	const state = await client.walrus.systemState();
	return BigInt(state.storage_price_per_unit_size);
}

/** The storage price moved between the quote and the transaction; nothing was signed. */
export class PriceChangedError extends Error {
	constructor() {
		super(
			"The storage price changed since this quote. Check the new cost and try again.",
		);
		this.name = "PriceChangedError";
	}
}

/**
 * One transaction extending each blob by its epochs. Each `extendBlob` pays
 * its own WAL, `units × storage price × epochs`, so "Extend all" is still
 * one signature (notes section 8). The SDK prices each payment from its
 * cached system state when the transaction is built, and other reads can
 * refresh that cache, so the first step checks the price is still
 * `pricePerUnit`, the price the cost was quoted at: if it moved, building
 * fails before the wallet is asked. Move takes exactly the price of the
 * moment and the SDK then destroys the coin as empty, so a transaction
 * never pays other than what was quoted.
 */
export function buildExtendTransaction(
	client: NetworkClient,
	items: readonly { objectId: string; epochs: number }[],
	pricePerUnit: bigint,
): Transaction {
	const transaction = new Transaction();
	transaction.add(async () => {
		const state = await client.walrus.systemState();
		if (BigInt(state.storage_price_per_unit_size) !== pricePerUnit)
			throw new PriceChangedError();
	});
	for (const item of items)
		transaction.add(
			client.walrus.extendBlob({
				blobObjectId: item.objectId,
				epochs: item.epochs,
			}),
		);
	return transaction;
}

/**
 * Deletes a deletable blob; Move `delete_blob` returns its `Storage` object,
 * which goes back to the owner.
 */
export function buildDeleteTransaction(
	client: NetworkClient,
	objectId: string,
	owner: string,
): Transaction {
	return client.walrus.deleteBlobTransaction({ blobObjectId: objectId, owner });
}

/**
 * Runs the transaction against current chain state without signing it.
 * Nothing is submitted, so nothing changes on chain.
 * @throws {SimulationFailedError} When it would fail.
 */
export async function simulateTransaction(
	client: NetworkClient,
	transaction: Transaction,
	sender: string,
	signal?: AbortSignal,
): Promise<SimulatedGas> {
	transaction.setSenderIfNotSet(sender);
	const result = await client.core.simulateTransaction({
		transaction,
		include: { effects: true },
		...(signal ? { signal } : {}),
	});
	if (result.$kind === "FailedTransaction")
		throw new SimulationFailedError(
			result.FailedTransaction.status.error?.message ?? "no reason given.",
		);
	const gas = result.Transaction.effects.gasUsed;
	return {
		netMist:
			BigInt(gas.computationCost) +
			BigInt(gas.storageCost) -
			BigInt(gas.storageRebate),
	};
}
