/**
 * Return the current browser origin (e.g. "https://app.example.com"), or null
 * when running outside a browser (SSR, Node, web worker without a location).
 *
 * SSR-safe: never throws on a missing `window`.
 */
export function resolveOrigin(): string | null {
	// `typeof` guards are the SSR-safe way to probe globals that may be absent.
	if (typeof window === "undefined" || typeof window.location === "undefined") {
		return null;
	}
	const { origin } = window.location;
	return origin.length > 0 ? origin : null;
}
