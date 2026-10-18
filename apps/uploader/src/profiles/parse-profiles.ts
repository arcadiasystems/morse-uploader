import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { isNetworkId } from "@/network/is-network-id";
import { normalizeProfileName } from "./normalize-profile-name";
import type { Profile } from "./profile";
import { PROFILES_STORAGE_VERSION } from "./serialize-profiles";

/**
 * Reads the stored profile list. Returns `null` when the document is not a
 * profile list of the current version; drops entries that are malformed or
 * repeat an earlier wallet, address and network pair.
 */
export function parseProfiles(raw: string): Profile[] | null {
	let document: unknown;
	try {
		document = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isRecord(document) || document.version !== PROFILES_STORAGE_VERSION)
		return null;
	if (!Array.isArray(document.profiles)) return null;

	const profiles: Profile[] = [];
	const seen = new Set<string>();
	for (const entry of document.profiles) {
		const profile = toProfile(entry);
		if (!profile) continue;
		const session = `${profile.walletId}\n${profile.address}\n${profile.network}`;
		if (seen.has(session)) continue;
		seen.add(session);
		profiles.push(profile);
	}
	return profiles;
}

function toProfile(entry: unknown): Profile | null {
	if (!isRecord(entry)) return null;
	const { id, name, walletId, walletName, address, network } = entry;
	if (
		!isNonEmptyString(id) ||
		!isNonEmptyString(walletId) ||
		!isNonEmptyString(walletName) ||
		typeof name !== "string" ||
		typeof address !== "string" ||
		!isValidSuiAddress(address) ||
		!isNetworkId(network)
	) {
		return null;
	}
	const normalizedName = normalizeProfileName(name);
	if (normalizedName === "") return null;
	return {
		id,
		name: normalizedName,
		walletId,
		walletName,
		address: normalizeSuiAddress(address),
		network,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value !== "";
}
