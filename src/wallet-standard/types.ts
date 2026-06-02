import type { Transaction } from "@mysten/sui/transactions";

/**
 * A wallet's sign-and-execute callback, e.g. dapp-kit's
 * `useSignAndExecuteTransaction().mutateAsync`. Returns the executed digest.
 */
export type WalletSignAndExecute = (input: {
	transaction: Transaction;
}) => Promise<{ digest: string }>;
