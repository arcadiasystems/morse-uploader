/**
 * Shared public types for morse-uploader. Type declarations only: no runtime
 * code lives here, so the one-function-per-file rule does not apply.
 */

/** Options controlling how {@link buildShareUrl} builds a link to an uploaded blob. */
export interface BuildShareUrlOptions {
	/**
	 * Base URL of the host app, e.g. "https://app.example.com". Takes priority
	 * over the detected browser origin when present.
	 */
	readonly appBaseUrl?: string;
	/**
	 * Path pattern containing the ":blobId" token, appended to the app base.
	 * Defaults to "/f/:blobId".
	 */
	readonly pattern?: string;
	/**
	 * Walrus aggregator base URL. Used as a fallback when no app base and no
	 * browser origin are available; produces the canonical "/v1/blobs/:blobId"
	 * view URL.
	 */
	readonly aggregatorBaseUrl?: string;
}
