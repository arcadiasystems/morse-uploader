import { type ParsedShareLink, parseShareLink } from "@arcadiasystems/morse-uploader";
import { useEffect, useState } from "react";

/**
 * Resolve the current location into a share-link target, re-resolving on
 * `hashchange`. Returns the parsed `{ fileId, sealId }` for a `#/f/...` link, or
 * null for the home route.
 */
export function useHashRoute(): ParsedShareLink | null {
	const [route, setRoute] = useState<ParsedShareLink | null>(() =>
		parseShareLink(window.location.href),
	);

	useEffect(() => {
		const onChange = () => setRoute(parseShareLink(window.location.href));
		window.addEventListener("hashchange", onChange);
		return () => window.removeEventListener("hashchange", onChange);
	}, []);

	return route;
}
