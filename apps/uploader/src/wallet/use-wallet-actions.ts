import {
	useCurrentClient,
	useDAppKit,
	useWalletConnection,
} from "@mysten/dapp-kit-react";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { useMemo } from "react";
import type { SignPersonalMessage } from "@/morse/recipient-file-access";
import type { NetworkId } from "@/network/networks";
import {
	createWalletExecutor,
	type WalletExecutor,
	walletRequestError,
} from "@/transfers/wallet-executor";

/** What the drawer signs with: transactions and personal messages, for the connected account. */
export interface WalletActions {
	address: string;
	executor: WalletExecutor;
	signPersonalMessage: SignPersonalMessage;
}

/**
 * The connected wallet's signing, for the current account on `network`, or
 * `null` when no wallet is connected. Transactions are signed with
 * `sui:signTransaction` and submitted by the app, as the transfer queue does.
 */
export function useWalletActions(network: NetworkId): WalletActions | null {
	const dAppKit = useDAppKit();
	const connection = useWalletConnection();
	const client = useCurrentClient();
	const account = connection.isConnected ? connection.account : null;
	return useMemo(() => {
		if (account === null) return null;
		const address = normalizeSuiAddress(account.address);
		return {
			address,
			executor: createWalletExecutor(
				address,
				(transaction) =>
					dAppKit.signTransaction({ transaction, account, network }),
				client,
			),
			signPersonalMessage: async (message) => {
				try {
					return await dAppKit.signPersonalMessage({
						message,
						account,
						network,
					});
				} catch (error) {
					throw walletRequestError(error);
				}
			},
		};
	}, [account, client, dAppKit, network]);
}
