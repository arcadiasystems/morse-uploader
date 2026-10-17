import type { Profile } from "./profile";

/** The list without the profile with this id. */
export function removeProfile(
	profiles: readonly Profile[],
	id: string,
): Profile[] {
	return profiles.filter((profile) => profile.id !== id);
}
