import type { NetworkId } from "@/network/networks";

/**
 * A saved wallet and network pair, like a site in FileZilla's site manager.
 * Switching profiles changes the account and network without disconnecting.
 */
export interface Profile {
	id: string;
	name: string;
	/** Wallet Standard identity from dApp Kit's `getWalletUniqueIdentifier`. */
	walletId: string;
	walletName: string;
	/** Normalized 0x-prefixed, 64 hex character Sui address. */
	address: string;
	network: NetworkId;
}

/** What identifies the session a profile describes. */
export type ProfileSession = Pick<Profile, "walletId" | "address" | "network">;

export type ProfileDraft = Omit<Profile, "id">;

export const PROFILE_NAME_MAX_LENGTH = 40;
