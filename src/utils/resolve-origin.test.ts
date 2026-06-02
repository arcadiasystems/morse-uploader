import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveOrigin } from "./resolve-origin.js";

describe("resolveOrigin", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns the browser origin under jsdom", () => {
		// jsdom provides a window.location with a non-empty origin.
		expect(resolveOrigin()).toBe(window.location.origin);
	});

	it("returns null when window is absent (SSR)", () => {
		vi.stubGlobal("window", undefined);
		expect(resolveOrigin()).toBeNull();
	});
});
