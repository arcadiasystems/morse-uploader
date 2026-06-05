import type { FilePhase } from "./types.js";

const LABELS: Record<FilePhase, string> = {
	encrypting: "Encrypting",
	uploading: "Uploading to Walrus",
	submitting: "Submitting transaction",
	complete: "Complete",
};

/** Human-readable label for an upload phase, for the progress stepper. */
export function uploadPhaseLabel(phase: FilePhase): string {
	return LABELS[phase];
}
