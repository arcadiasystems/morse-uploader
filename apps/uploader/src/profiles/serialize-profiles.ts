import type { Profile } from "./profile";

export const PROFILES_STORAGE_VERSION = 1;

/** The stored form of the profile list. */
export function serializeProfiles(profiles: readonly Profile[]): string {
	return JSON.stringify({ version: PROFILES_STORAGE_VERSION, profiles });
}
