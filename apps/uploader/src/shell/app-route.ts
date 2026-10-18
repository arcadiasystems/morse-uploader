import { useCallback, useSyncExternalStore } from "react";

/**
 * Where the app is: the Overview, or Files with a filter. It lives in the
 * URL hash (`#overview`, `#files/expiring`) so a reload, a bookmark or the
 * back button returns to the same place.
 */
export const FILE_FILTERS = [
	"all",
	"quilts",
	"encrypted",
	"expiring",
	"published",
	"shared",
] as const;

export type FileFilter = (typeof FILE_FILTERS)[number];

export type AppRoute =
	| { view: "overview" }
	| { view: "files"; filter: FileFilter };

const OVERVIEW: AppRoute = { view: "overview" };

function isFileFilter(value: string): value is FileFilter {
	return (FILE_FILTERS as readonly string[]).includes(value);
}

/** The route a hash names; anything unknown is the Overview, the home. */
export function parseRoute(hash: string): AppRoute {
	const [view, filter = "all"] = hash.replace(/^#/, "").split("/");
	if (view !== "files" || !isFileFilter(filter)) return OVERVIEW;
	return { view: "files", filter };
}

export function routeHash(route: AppRoute): string {
	if (route.view === "overview") return "#overview";
	return route.filter === "all" ? "#files" : `#files/${route.filter}`;
}

function subscribe(onChange: () => void): () => void {
	window.addEventListener("hashchange", onChange);
	return () => window.removeEventListener("hashchange", onChange);
}

const readHash = () => window.location.hash;

/** The current route, and a way to go to another; each move is a history entry. */
export function useAppRoute(): [AppRoute, (route: AppRoute) => void] {
	const hash = useSyncExternalStore(subscribe, readHash, () => "");
	const navigate = useCallback((route: AppRoute) => {
		window.location.hash = routeHash(route);
	}, []);
	return [parseRoute(hash), navigate];
}
