import { normalizeSuiAddress } from "@mysten/sui/utils";
import type { ProfileSession } from "./profile";

/** True when two sessions use the same wallet, address and network. */
export function isSameSession(a: ProfileSession, b: ProfileSession): boolean {
	return (
		a.walletId === b.walletId &&
		a.network === b.network &&
		normalizeSuiAddress(a.address) === normalizeSuiAddress(b.address)
	);
}
