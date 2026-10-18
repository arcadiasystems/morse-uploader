import {
	getWalletUniqueIdentifier,
	type UiWallet,
	type UiWalletAccount,
	useCurrentNetwork,
	useWalletConnection,
} from "@mysten/dapp-kit-react";
import { findProfile } from "@/profiles/find-profile";
import type { Profile } from "@/profiles/profile";
import { useProfiles } from "@/profiles/use-profiles";

export interface Session {
	wallet: UiWallet;
	account: UiWalletAccount;
	walletId: string;
	/** The saved profile for this wallet, account and network, if any. */
	profile: Profile | undefined;
}

/** The connected wallet session on the current network, or `null` when disconnected. */
export function useSession(): Session | null {
	const connection = useWalletConnection();
	const network = useCurrentNetwork();
	const profiles = useProfiles();
	if (!connection.isConnected) return null;
	const walletId = getWalletUniqueIdentifier(connection.wallet);
	return {
		wallet: connection.wallet,
		account: connection.account,
		walletId,
		profile: findProfile(profiles, {
			walletId,
			address: connection.account.address,
			network,
		}),
	};
}
