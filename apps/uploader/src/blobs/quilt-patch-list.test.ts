import { describe, expect, it } from "vitest";
import { parseQuiltPatchList } from "./quilt-patch-list";

describe("parseQuiltPatchList", () => {
	it("reads the aggregator's live answer for a Testnet quilt", () => {
		// GET /v1/quilts/LoFCiFAn9m5X4kwNomSLtZ4qGx2IQHIeFExiHrnBHew/patches, 2026-10-18.
		const body = [
			{
				identifier: "first-1792274439933",
				patch_id: "LoFCiFAn9m5X4kwNomSLtZ4qGx2IQHIeFExiHrnBHewBAQACAA",
				tags: {},
			},
			{
				identifier: "second-1792274439933",
				patch_id: "LoFCiFAn9m5X4kwNomSLtZ4qGx2IQHIeFExiHrnBHewBAgADAA",
				tags: { "content-type": "text/plain", size: 12 },
			},
		];
		expect(parseQuiltPatchList(body)).toEqual([
			{
				identifier: "first-1792274439933",
				patchId: "LoFCiFAn9m5X4kwNomSLtZ4qGx2IQHIeFExiHrnBHewBAQACAA",
				tags: {},
			},
			{
				identifier: "second-1792274439933",
				patchId: "LoFCiFAn9m5X4kwNomSLtZ4qGx2IQHIeFExiHrnBHewBAgADAA",
				tags: { "content-type": "text/plain" },
			},
		]);
	});

	it("rejects bodies of another shape", () => {
		expect(() => parseQuiltPatchList({ patches: [] })).toThrow();
		expect(() => parseQuiltPatchList([{ identifier: "a" }])).toThrow(
			/no identifier or patch id/,
		);
		expect(() => parseQuiltPatchList([null])).toThrow();
	});
});
