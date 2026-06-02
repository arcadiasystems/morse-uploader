import type { BuildShareUrlOptions } from "../types.js";
import { applyBlobIdPattern } from "../utils/apply-blob-id-pattern.js";
import { joinUrl } from "../utils/join-url.js";
import { resolveOrigin } from "../utils/resolve-origin.js";
import { trimTrailingSlashes } from "../utils/trim-trailing-slashes.js";

// Default path pattern for app links. Consumers override via options.pattern.
const DEFAULT_PATTERN = "/f/:blobId";

/**
 * Build a shareable URL for an uploaded Walrus blob.
 *
 * Resolution order:
 * 1. `options.appBaseUrl`, when provided.
 * 2. the current browser origin (when running in a browser).
 *    Both 1 and 2 produce an app link: the base joined to `options.pattern`
 *    (default "/f/:blobId") with the ":blobId" token substituted.
 * 3. `options.aggregatorBaseUrl`, producing the Walrus aggregator view URL
 *    "{aggregator}/v1/blobs/{blobId}".
 *
 * @throws {Error} when no app base, browser origin, or aggregator base is available.
 */
export function buildShareUrl(
	blobId: string,
	options: BuildShareUrlOptions = {},
): string {
	const pattern = options.pattern ?? DEFAULT_PATTERN;
	const appBase = options.appBaseUrl ?? resolveOrigin();
	if (appBase !== null && appBase.length > 0) {
		return joinUrl(appBase, applyBlobIdPattern(pattern, blobId));
	}
	if (
		options.aggregatorBaseUrl !== undefined &&
		options.aggregatorBaseUrl.length > 0
	) {
		const base = trimTrailingSlashes(options.aggregatorBaseUrl);
		return `${base}/v1/blobs/${encodeURIComponent(blobId)}`;
	}
	throw new Error(
		"buildShareUrl: no appBaseUrl, browser origin, or aggregatorBaseUrl available to build a link.",
	);
}
