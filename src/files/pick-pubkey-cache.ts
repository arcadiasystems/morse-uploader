import {
	BrowserStoragePubkeyCache,
	type PubkeyCache,
} from "@arcadiasystems/morse-sdk";

/**
 * A localStorage-backed pubkey cache in browsers, undefined elsewhere. Lets
 * fromAccountAsync skip the Phantom probe popup on subsequent reloads.
 */
export function pickPubkeyCache(): PubkeyCache | undefined {
	if (typeof window === "undefined") {
		return undefined;
	}
	try {
		return new BrowserStoragePubkeyCache();
	} catch {
		return undefined;
	}
}
