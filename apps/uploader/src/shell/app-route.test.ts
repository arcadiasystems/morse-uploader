import { describe, expect, it } from "vitest";
import { BLOB_FILTERS } from "@/blobs/filter-rows";
import { parseRoute, routeHash } from "./app-route";

describe("parseRoute", () => {
	it("opens the Overview, the home, for an empty or unknown hash", () => {
		for (const hash of ["", "#", "#overview", "#nowhere", "#files/expired"])
			expect(parseRoute(hash)).toEqual({ view: "overview" });
	});

	it("reads Files with all blobs from #files", () => {
		expect(parseRoute("#files")).toEqual({ view: "files", filter: "all" });
		expect(parseRoute("files")).toEqual({ view: "files", filter: "all" });
	});
});

describe("routeHash", () => {
	it("round-trips every Files filter and the Overview", () => {
		for (const filter of BLOB_FILTERS) {
			const route = { view: "files", filter } as const;
			expect(parseRoute(routeHash(route))).toEqual(route);
		}
		expect(routeHash({ view: "overview" })).toBe("#overview");
		expect(parseRoute(routeHash({ view: "overview" }))).toEqual({
			view: "overview",
		});
	});

	it("writes all blobs as plain #files and the others with their filter", () => {
		expect(routeHash({ view: "files", filter: "all" })).toBe("#files");
		expect(routeHash({ view: "files", filter: "expiring" })).toBe(
			"#files/expiring",
		);
	});
});
