import type { SuiClientTypes } from "@mysten/sui/client";
import type { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import type { NetworkClient } from "@/network/create-network-client";

/** What a Wallet Standard wallet returns from `sui:signTransaction`. */
export interface SignedTransaction {
	bytes: string;
	signature: string;
}

export type SignWithWallet = (
	transaction: Transaction,
) => Promise<SignedTransaction>;

export interface ExecutedTransaction {
	digest: string;
	effects: SuiClientTypes.TransactionEffects;
	objectTypes: Record<string, string>;
}

/** The user declined the request in their wallet. Nothing was submitted. */
export class WalletRejectedError extends Error {
	constructor(options?: { cause?: unknown }) {
		super("You declined the request in your wallet.", options);
		this.name = "WalletRejectedError";
	}
}

/** The transaction ran on chain and failed; its gas was spent. */
export class TransactionFailedError extends Error {
	readonly digest: string;
	readonly status: SuiClientTypes.ExecutionStatus;

	constructor(digest: string, status: SuiClientTypes.ExecutionStatus) {
		super(
			`The transaction ${digest} failed on chain: ${status.error?.message ?? "no reason given"}.`,
		);
		this.name = "TransactionFailedError";
		this.digest = digest;
		this.status = status;
	}
}

/**
 * The transaction was submitted, but its result could not be read. It may
 * have run: signing again could pay twice, so the digest is checked first.
 */
export class TransactionUnconfirmedError extends Error {
	readonly digest: string;

	constructor(digest: string, options?: { cause?: unknown }) {
		super(
			`Transaction ${digest} was sent, but its result could not be read yet.`,
			options,
		);
		this.name = "TransactionUnconfirmedError";
		this.digest = digest;
	}
}

/** The browser blocked the wallet's window: it opens only right after a click. */
export class WalletPopupBlockedError extends Error {
	constructor(options?: { cause?: unknown }) {
		super(
			"Your wallet opens in a window, which the browser allows only after a click.",
			options,
		);
		this.name = "WalletPopupBlockedError";
	}
}

/**
 * Wallets have no standard rejection error; Slush, Suiet and dApp Kit all
 * word it as one of these.
 */
const REJECTION = /reject|denied|declined|cancel/i;
/** Slush's web wallet when `window.open` is refused without a user gesture. */
const POPUP_BLOCKED = /open (a )?new window|popup/i;

export interface WalletExecutor {
	address: string;
	/**
	 * Asks the wallet to sign, submits exactly the bytes it signed and waits
	 * until the transaction is final and readable.
	 * @throws {WalletRejectedError} When the user declines in the wallet.
	 * @throws {TransactionFailedError} When the transaction fails on chain.
	 */
	execute(
		transaction: Transaction,
		signal?: AbortSignal,
	): Promise<ExecutedTransaction>;
	/**
	 * Waits for a transaction submitted earlier, without signing again.
	 * @throws {TransactionFailedError} When it failed on chain.
	 * @throws {TransactionUnconfirmedError} When its result still cannot be read.
	 */
	confirm(digest: string, signal?: AbortSignal): Promise<ExecutedTransaction>;
}

/**
 * Signs through the wallet with `sui:signTransaction` and submits through
 * the app's own client, which every Wallet Standard wallet supports. The
 * wallet's bytes are submitted as they are, so the signature always matches
 * what the wallet showed (the same rule morse-sdk's WalletStandardSigner
 * follows).
 */
export function createWalletExecutor(
	address: string,
	sign: SignWithWallet,
	client: NetworkClient,
): WalletExecutor {
	async function confirm(
		digest: string,
		signal?: AbortSignal,
	): Promise<ExecutedTransaction> {
		let final: SuiClientTypes.TransactionResult<{
			effects: true;
			objectTypes: true;
		}>;
		try {
			final = await client.core.waitForTransaction({
				digest,
				include: { effects: true, objectTypes: true },
				...(signal ? { signal } : {}),
			});
		} catch (error) {
			throw new TransactionUnconfirmedError(digest, { cause: error });
		}
		if (final.$kind === "FailedTransaction")
			throw new TransactionFailedError(
				final.FailedTransaction.digest,
				final.FailedTransaction.status,
			);
		return {
			digest: final.Transaction.digest,
			effects: final.Transaction.effects,
			objectTypes: final.Transaction.objectTypes,
		};
	}

	return {
		address,
		confirm,
		async execute(transaction, signal) {
			transaction.setSenderIfNotSet(address);
			let signed: SignedTransaction;
			try {
				signed = await sign(transaction);
			} catch (error) {
				if (error instanceof Error && REJECTION.test(error.message))
					throw new WalletRejectedError({ cause: error });
				if (error instanceof Error && POPUP_BLOCKED.test(error.message))
					throw new WalletPopupBlockedError({ cause: error });
				throw error;
			}
			const submitted = await client.core.executeTransaction({
				transaction: fromBase64(signed.bytes),
				signatures: [signed.signature],
				include: { effects: true },
				...(signal ? { signal } : {}),
			});
			if (submitted.$kind === "FailedTransaction")
				throw new TransactionFailedError(
					submitted.FailedTransaction.digest,
					submitted.FailedTransaction.status,
				);
			return confirm(submitted.Transaction.digest, signal);
		},
	};
}
