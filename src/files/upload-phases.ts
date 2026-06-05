import type { FilePhase } from "./types.js";

const ENCRYPTED_PHASES: readonly FilePhase[] = [
	"encrypting",
	"uploading",
	"submitting",
	"complete",
];
const PUBLIC_PHASES: readonly FilePhase[] = [
	"uploading",
	"submitting",
	"complete",
];

/**
 * The ordered upload phases for the progress stepper. Public uploads skip the
 * `encrypting` phase since there is no Seal step.
 */
export function uploadPhases(encrypted: boolean): readonly FilePhase[] {
	return encrypted ? ENCRYPTED_PHASES : PUBLIC_PHASES;
}
