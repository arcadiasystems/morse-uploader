/**
 * Substitute the ":blobId" token in a path pattern with a URL-encoded blob id.
 *
 * Example: applyBlobIdPattern("/f/:blobId", "abc/123") -> "/f/abc%2F123".
 */
export function applyBlobIdPattern(pattern: string, blobId: string): string {
	return pattern.replace(/:blobId\b/g, encodeURIComponent(blobId));
}
