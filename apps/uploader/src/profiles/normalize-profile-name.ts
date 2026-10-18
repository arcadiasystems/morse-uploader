import { PROFILE_NAME_MAX_LENGTH } from "./profile";

/** Trims, collapses inner whitespace and caps a profile name at 40 characters. */
export function normalizeProfileName(name: string): string {
	return name
		.trim()
		.replace(/\s+/g, " ")
		.slice(0, PROFILE_NAME_MAX_LENGTH)
		.trim();
}
