import {
	type FormattedError,
	formatUserMessage,
} from "@arcadiasystems/morse-sdk";
import { ShareLinkSealError } from "./share-link-seal-error.js";
import type { ShareLinkSealErrorReason } from "./types.js";

const TITLES: Readonly<Record<ShareLinkSealErrorReason, string>> = {
	missing: "Link is incomplete",
	mismatch: "Link does not match this file",
};

/**
 * Render a download failure for the UI. Defers to the SDK's `formatUserMessage`
 * except for a {@link ShareLinkSealError}, which the SDK does not know and
 * would title "Unexpected error" when it is really "ask for the full link".
 */
export function downloadErrorMessage(error: unknown): FormattedError {
	if (!(error instanceof ShareLinkSealError)) {
		return formatUserMessage(error);
	}
	return {
		title: TITLES[error.reason],
		description: error.message,
		cause: error,
	};
}
