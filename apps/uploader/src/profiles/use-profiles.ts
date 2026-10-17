import { useSyncExternalStore } from "react";
import type { Profile } from "./profile";
import { NO_PROFILES, profileStore } from "./profile-store";

/** The saved profiles, kept in sync with the store and other tabs. */
export function useProfiles(): readonly Profile[] {
	return useSyncExternalStore(
		profileStore.subscribe,
		profileStore.get,
		() => NO_PROFILES,
	);
}
