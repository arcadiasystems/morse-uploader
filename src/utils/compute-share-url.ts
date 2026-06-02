import { buildShareUrl } from "../core/build-share-url.js";
import type { BuildShareUrlOptions } from "../types.js";

/**
 * Build a share URL for a blob id, returning null instead of throwing when no
 * link source is available (e.g. SSR with no app base or aggregator). Use this
 * in UI paths where a missing link should degrade gracefully.
 */
export function computeShareUrl(
	blobId: string,
	options?: BuildShareUrlOptions,
): string | null {
	try {
		return buildShareUrl(blobId, options ?? {});
	} catch {
		return null;
	}
}
