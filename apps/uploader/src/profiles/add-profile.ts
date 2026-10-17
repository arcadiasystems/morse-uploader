import { normalizeSuiAddress } from "@mysten/sui/utils";
import { findProfile } from "./find-profile";
import { normalizeProfileName } from "./normalize-profile-name";
import type { Profile, ProfileDraft } from "./profile";

export type AddProfileResult =
	| { ok: true; profiles: Profile[]; profile: Profile }
	| { ok: false; reason: "empty-name" }
	| { ok: false; reason: "duplicate"; existing: Profile };

/**
 * Adds a profile to the end of the list. A wallet, address and network pair
 * can be saved once; the name is normalized and must not be empty.
 */
export function addProfile(
	profiles: readonly Profile[],
	draft: ProfileDraft,
	id: string,
): AddProfileResult {
	const name = normalizeProfileName(draft.name);
	if (name === "") return { ok: false, reason: "empty-name" };
	const existing = findProfile(profiles, draft);
	if (existing) return { ok: false, reason: "duplicate", existing };
	const profile: Profile = {
		...draft,
		id,
		name,
		address: normalizeSuiAddress(draft.address),
	};
	return { ok: true, profiles: [...profiles, profile], profile };
}
