/**
 * The browser's localStorage, or `null` when there is none: on the server, or
 * when the browser blocks storage (private windows, disabled site data), where
 * even reading `window.localStorage` throws a SecurityError.
 */
export function browserStorage(): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
