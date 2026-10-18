import {
	getWalletUniqueIdentifier,
	type UiWallet,
	useDAppKit,
	useWalletConnection,
	useWallets,
} from "@mysten/dapp-kit-react";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { useCallback } from "react";
import { shortenAddress } from "@/lib/shorten-address";
import type { NetworkId } from "@/network/networks";
import { type AddProfileResult, addProfile } from "@/profiles/add-profile";
import type { Profile, ProfileDraft } from "@/profiles/profile";
import { profileStore } from "@/profiles/profile-store";
import { removeProfile } from "@/profiles/remove-profile";

export interface ProfileActions {
	/** Switches to a profile's account and network, connecting its wallet only when needed. */
	activate: (profile: Profile) => Promise<void>;
	/** Saves a profile; switching to it is a separate `activate`. */
	save: (draft: ProfileDraft) => AddProfileResult;
	remove: (id: string) => void;
	connect: (wallet: UiWallet) => Promise<void>;
	disconnect: () => Promise<void>;
	switchNetwork: (network: NetworkId) => void;
}

export function useProfileActions(): ProfileActions {
	const dAppKit = useDAppKit();
	const wallets = useWallets();
	const connection = useWalletConnection();

	const activate = useCallback(
		async (profile: Profile) => {
			const connected = connection.isConnected ? connection.wallet : null;
			if (
				connected &&
				getWalletUniqueIdentifier(connected) === profile.walletId
			) {
				const account = connected.accounts.find(
					(candidate) =>
						normalizeSuiAddress(candidate.address) === profile.address,
				);
				if (account) {
					dAppKit.switchNetwork(profile.network);
					dAppKit.switchAccount({ account });
					return;
				}
			}
			const wallet = wallets.find(
				(candidate) =>
					getWalletUniqueIdentifier(candidate) === profile.walletId,
			);
			if (!wallet)
				throw new Error(
					`${profile.walletName} is not available in this browser.`,
				);
			dAppKit.switchNetwork(profile.network);
			const { accounts } = await dAppKit.connectWallet({ wallet });
			const account = accounts.find(
				(candidate) =>
					normalizeSuiAddress(candidate.address) === profile.address,
			);
			if (!account) {
				throw new Error(
					`${profile.walletName} did not share ${shortenAddress(profile.address)}. Allow that account in the wallet and try again.`,
				);
			}
			dAppKit.switchAccount({ account });
		},
		[connection, dAppKit, wallets],
	);

	const save = useCallback((draft: ProfileDraft) => {
		const result = addProfile(profileStore.get(), draft, crypto.randomUUID());
		if (result.ok) profileStore.set(result.profiles);
		return result;
	}, []);

	const remove = useCallback((id: string) => {
		profileStore.set(removeProfile(profileStore.get(), id));
	}, []);

	const connect = useCallback(
		async (wallet: UiWallet) => {
			await dAppKit.connectWallet({ wallet });
		},
		[dAppKit],
	);

	const disconnect = useCallback(() => dAppKit.disconnectWallet(), [dAppKit]);
	const switchNetwork = useCallback(
		(network: NetworkId) => dAppKit.switchNetwork(network),
		[dAppKit],
	);

	return { activate, save, remove, connect, disconnect, switchNetwork };
}
