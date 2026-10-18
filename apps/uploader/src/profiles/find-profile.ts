import { isSameSession } from "./is-same-session";
import type { Profile, ProfileSession } from "./profile";

/** The saved profile for a session, if there is one. */
export function findProfile(
	profiles: readonly Profile[],
	session: ProfileSession,
): Profile | undefined {
	return profiles.find((profile) => isSameSession(profile, session));
}
