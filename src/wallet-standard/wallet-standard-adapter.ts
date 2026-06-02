import {
	type SimulationReturnValues,
	type SuiAddress,
	type TransactionExecutor,
	TransportError,
	type TxReceipt,
	toSuiAddress,
	type WalletAdapter,
} from "@arcadiasystems/morse-sdk";
import type { Transaction } from "@mysten/sui/transactions";
import { failedTransactionMessage } from "./failed-transaction-message.js";
import { parseTxReceipt } from "./parse-tx-receipt.js";
import type { WalletSignAndExecute } from "./types.js";

/**
 * Browser `WalletAdapter` for morse-sdk ops, backed by a wallet's
 * sign-and-execute callback (e.g. dapp-kit). Vendored here as an optional
 * helper so consumers do not hand-copy it. The user's key never leaves the
 * wallet; the dapp-kit wiring stays in the host app.
 */
export class WalletStandardAdapter implements WalletAdapter {
	readonly address: SuiAddress;

	constructor(
		address: string,
		private readonly signAndExecute: WalletSignAndExecute,
		private readonly client: TransactionExecutor,
	) {
		this.address = toSuiAddress(address);
	}

	async signAndExecuteTransaction(
		tx: Transaction,
		signal?: AbortSignal,
	): Promise<TxReceipt> {
		let digest: string;
		try {
			const result = await this.signAndExecute({ transaction: tx });
			digest = result.digest;
		} catch (cause) {
			throw new TransportError(
				`wallet sign-and-execute failed: ${cause instanceof Error ? cause.message : String(cause)}`,
				{ cause },
			);
		}

		const final = await this.client.waitForTransaction({
			digest,
			include: { effects: true, objectTypes: true },
			...(signal === undefined ? {} : { signal }),
		});
		if (final.$kind === "FailedTransaction") {
			throw new TransportError(
				failedTransactionMessage(final.FailedTransaction),
			);
		}
		return parseTxReceipt(final.Transaction);
	}

	async simulateTransaction(
		tx: Transaction,
		signal?: AbortSignal,
	): Promise<SimulationReturnValues> {
		tx.setSenderIfNotSet(this.address);
		const result = await this.client.simulateTransaction({
			transaction: tx,
			include: { effects: true, commandResults: true },
			...(signal === undefined ? {} : { signal }),
		});
		if (result.$kind === "FailedTransaction") {
			throw new TransportError(
				failedTransactionMessage(result.FailedTransaction),
			);
		}
		const commandResults = result.commandResults ?? [];
		return commandResults.map((cmd) => cmd.returnValues.map((rv) => rv.bcs));
	}
}
