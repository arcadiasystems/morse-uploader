import { useDAppKit, useWalletConnection } from "@mysten/dapp-kit-react";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import type { NetworkId } from "@/network/networks";
import { createSavedUploads } from "./saved-uploads";
import { TransferQueue } from "./transfer-queue";
import type { TransferItem, TransferState } from "./transfer-state";

export interface TransferQueueHandle {
	queue: TransferQueue;
	state: TransferState;
	/** Why saved uploads could not be brought back, if they could not. */
	restoreError: unknown;
}

/**
 * The app's one transfer queue. It signs with the connected wallet, always
 * for the account and network an item was queued for, so switching profile
 * mid-batch never signs for the wrong chain: the item asks to reconnect.
 * Uploads saved for the active wallet and network come back on load.
 */
export function useTransferQueue(
	network: NetworkId,
	address: string | null,
	onDone: (item: TransferItem) => void,
): TransferQueueHandle {
	const dAppKit = useDAppKit();
	const connection = useWalletConnection();
	const latest = useRef({ connection, onDone });
	useLayoutEffect(() => {
		latest.current = { connection, onDone };
	});

	const [queue] = useState(
		() =>
			new TransferQueue({
				client: (id) => dAppKit.getClient(id),
				signer: (id, owner) => {
					const current = latest.current.connection;
					if (
						!current.isConnected ||
						normalizeSuiAddress(current.account.address) !== owner
					)
						return null;
					const account = current.account;
					return (transaction) =>
						dAppKit.signTransaction({ transaction, account, network: id });
				},
				savedUploads: createSavedUploads(),
				onDone: (item) => latest.current.onDone(item),
				now: Date.now,
			}),
	);
	const state = useSyncExternalStore(
		queue.subscribe,
		queue.getState,
		queue.getState,
	);

	const [restoreError, setRestoreError] = useState<unknown>(null);
	useEffect(() => {
		if (address === null) return;
		let current = true;
		setRestoreError(null);
		queue
			.restore(network, normalizeSuiAddress(address))
			.catch((error: unknown) => {
				if (current) setRestoreError(error);
			});
		return () => {
			current = false;
		};
	}, [queue, network, address]);

	return { queue, state, restoreError };
}
