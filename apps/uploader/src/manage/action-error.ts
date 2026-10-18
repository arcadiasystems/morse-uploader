import {
	ConnectionTimeoutError,
	NoBlobMetadataReceivedError,
	NotEnoughBlobConfirmationsError,
	NotEnoughSliversReceivedError,
} from "@mysten/walrus";
import { errorMessage } from "@/lib/error-message";
import {
	TransactionUnconfirmedError,
	WalletPopupBlockedError,
	WalletRejectedError,
} from "@/transfers/wallet-executor";

/** `coinWithBalance` and the Move VM word a short balance in one of these ways. */
const INSUFFICIENT_WAL = /insufficient balance of .*::wal::WAL/i;
const INSUFFICIENT_GAS =
	/insufficient (gas|sui)|InsufficientGas|GasBalanceTooLow|balance of gas object .* is lower/i;
const INSUFFICIENT_COIN =
	/InsufficientCoinBalance|insufficient (coin )?balance/i;

/**
 * A failed action as the inspector says it: the wallet declined, the
 * wallet cannot pay, storage nodes did not answer, or what chain reported.
 */
export function describeActionError(error: unknown): string {
	if (error instanceof WalletRejectedError) return error.message;
	if (error instanceof WalletPopupBlockedError)
		return `${error.message} Press the button again.`;
	if (error instanceof TransactionUnconfirmedError)
		return `${error.message} Refresh to see whether it went through before you try again.`;
	if (error instanceof NotEnoughBlobConfirmationsError)
		return "Not enough storage nodes confirmed they hold this blob. Try again in a minute.";
	if (
		error instanceof NoBlobMetadataReceivedError ||
		error instanceof NotEnoughSliversReceivedError
	)
		return "Storage nodes did not return enough of this blob. Try again in a minute.";
	if (error instanceof ConnectionTimeoutError)
		return "The upload relay timed out. Try again.";
	const message = errorMessage(error);
	if (INSUFFICIENT_WAL.test(message))
		return "Your wallet does not have enough WAL for this. Top up WAL, then try again.";
	if (INSUFFICIENT_GAS.test(message))
		return "Your wallet does not have enough SUI for the network fee. Top up SUI, then try again.";
	if (INSUFFICIENT_COIN.test(message))
		return "Your wallet does not have enough WAL or SUI for this transaction.";
	return message;
}
