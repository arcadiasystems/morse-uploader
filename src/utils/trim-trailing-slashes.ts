/** Remove any trailing slashes from a URL or path segment. */
export function trimTrailingSlashes(value: string): string {
	return value.replace(/\/+$/, "");
}
