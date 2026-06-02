import { describe, expect, it, vi } from "vitest";
import { fetchBlobEndEpoch } from "./fetch-blob-end-epoch.js";

describe("fetchBlobEndEpoch", () => {
	it("reads storage.end_epoch from the blob object", async () => {
		const source = {
			getBlobObject: vi.fn().mockResolvedValue({ storage: { end_epoch: 42 } }),
		};
		expect(await fetchBlobEndEpoch(source, "0xblob")).toBe(42);
		expect(source.getBlobObject).toHaveBeenCalledWith("0xblob");
	});
});
