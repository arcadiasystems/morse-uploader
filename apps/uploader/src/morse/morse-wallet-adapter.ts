import type {
	AbortModule,
	MorseError,
	SimulationReturnValues,
	TxReceipt,
	WalletAdapter,
} from "@arcadiasystems/morse-sdk";
import type { SuiClientTypes } from "@mysten/sui/client";
import type { NetworkClient } from "@/network/create-network-client";
import {
	TransactionFailedError,
	type WalletExecutor,
} from "@/transfers/wallet-executor";
import type { MorseSdk } from "./load-morse-sdk";

/** Modules whose abort codes morse-sdk can name. */
const MORSE_MODULES: ReadonlySet<string> = new Set<AbortModule>([
	"publication",
	"collection",
	"entry",
	"recipient_file",
]);

/**
 * A morse-sdk `WalletAdapter` for the connected Wallet Standard wallet. The
 * README asks browser apps to implement one. `KeypairAdapter` cannot wrap
 * morse-sdk's `WalletStandardSigner`: it signs through
 * `client.signAndExecuteTransaction`, which calls the signer's raw-byte
 * `signTransaction`, and that signer refuses raw bytes (PROTOCOL-NOTES
 * UNCONFIRMED item 8, now checked against the 0.9.0 sources).
 */
export function createMorseWalletAdapter(
	sdk: MorseSdk,
	executor: WalletExecutor,
	client: NetworkClient,
): WalletAdapter {
	const address = sdk.toSuiAddress(executor.address);
	return {
		address,
		async signAndExecuteTransaction(transaction, signal): Promise<TxReceipt> {
			try {
				const executed = await executor.execute(transaction, signal);
				const { effects, objectTypes } = executed;
				return {
					digest: executed.digest,
					gasUsedMist:
						BigInt(effects.gasUsed.computationCost) +
						BigInt(effects.gasUsed.storageCost) -
						BigInt(effects.gasUsed.storageRebate),
					createdObjects: effects.changedObjects.flatMap((change) => {
						const objectType = objectTypes[change.objectId];
						return change.idOperation === "Created" && objectType
							? [{ objectId: sdk.toSuiObjectId(change.objectId), objectType }]
							: [];
					}),
					deletedObjects: effects.changedObjects
						.filter((change) => change.idOperation === "Deleted")
						.map((change) => ({
							objectId: sdk.toSuiObjectId(change.objectId),
						})),
				};
			} catch (error) {
				if (error instanceof TransactionFailedError)
					throw abortError(sdk, error.status) ?? error;
				throw error;
			}
		},
		async simulateTransaction(
			transaction,
			signal,
		): Promise<SimulationReturnValues> {
			transaction.setSenderIfNotSet(address);
			const result = await client.core.simulateTransaction({
				transaction,
				include: { effects: true, commandResults: true },
				...(signal ? { signal } : {}),
			});
			if (result.$kind === "FailedTransaction") {
				const { status } = result.FailedTransaction;
				throw (
					abortError(sdk, status) ??
					new Error(
						`The transaction would fail: ${status.error?.message ?? "no reason given"}.`,
					)
				);
			}
			return result.commandResults.map((command) =>
				command.returnValues.map((value) => value.bcs),
			);
		},
	};
}

/** A Morse Move abort as morse-sdk's `ContractAbortError`, which names the reason. */
function abortError(
	sdk: MorseSdk,
	status: SuiClientTypes.ExecutionStatus,
): MorseError | null {
	const abort = status.error?.MoveAbort;
	const module = abort?.location?.module;
	if (!abort || !module || !isMorseModule(module)) return null;
	return sdk.ContractAbortError.fromAbortCode(module, Number(abort.abortCode));
}

function isMorseModule(module: string): module is AbortModule {
	return MORSE_MODULES.has(module);
}
