import { browserStorage } from "@/lib/browser-storage";
import { createPersistedStore } from "@/lib/create-persisted-store";
import { parseProfiles } from "./parse-profiles";
import type { Profile } from "./profile";
import { serializeProfiles } from "./serialize-profiles";

export const NO_PROFILES: readonly Profile[] = [];

/** Saved profiles, persisted per viewer in localStorage when it is available. */
export const profileStore = createPersistedStore<readonly Profile[]>({
	key: "morse-uploader:profiles",
	fallback: NO_PROFILES,
	parse: parseProfiles,
	serialize: serializeProfiles,
	storage: browserStorage(),
});
