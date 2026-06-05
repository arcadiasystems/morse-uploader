import { afterEach, describe, expect, it, vi } from "vitest";
import { triggerDownload } from "./trigger-download.js";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("triggerDownload", () => {
	it("creates an anchor with the filename and clicks it", () => {
		const click = vi
			.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(() => undefined);

		triggerDownload("blob:abc", "report.pdf");

		expect(click).toHaveBeenCalledTimes(1);
		// The anchor is removed after clicking.
		expect(document.querySelector("a[download]")).toBeNull();
	});
});
