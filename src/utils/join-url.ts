import { trimTrailingSlashes } from "./trim-trailing-slashes.js";

/** Join a base URL and a path with exactly one slash between them. */
export function joinUrl(base: string, path: string): string {
	const left = trimTrailingSlashes(base);
	const right = path.startsWith("/") ? path : `/${path}`;
	return `${left}${right}`;
}
