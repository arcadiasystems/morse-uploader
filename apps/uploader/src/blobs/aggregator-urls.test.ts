import { describe, expect, it } from "vitest";
import { NETWORKS } from "@/network/networks";
import {
	blobByObjectIdUrl,
	blobUrl,
	quiltPatchesUrl,
	quiltPatchUrl,
	quiltPathUrl,
} from "./aggregator-urls";

const TESTNET = NETWORKS.testnet.aggregatorUrl;
const MAINNET = NETWORKS.mainnet.aggregatorUrl;

describe("aggregator URLs (PROTOCOL-NOTES section 10)", () => {
	it("builds the by-object-id route", () => {
		expect(
			blobByObjectIdUrl(
				TESTNET,
				"0x23ff43fd00000000000000000000000000000000000000000000000000049ec",
			),
		).toBe(
			"https://aggregator.walrus-testnet.walrus.space/v1/blobs/by-object-id/0x23ff43fd00000000000000000000000000000000000000000000000000049ec",
		);
	});

	it("builds the blob id route on each network's aggregator", () => {
		const blobId = "ZwUNtNTiVu-7D1oLE11YPOh5_l2am8_Gwt_HQ_AvPZ8";
		expect(blobUrl(TESTNET, blobId)).toBe(
			`https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`,
		);
		expect(blobUrl(MAINNET, blobId)).toBe(
			`https://aggregator.walrus-mainnet.walrus.space/v1/blobs/${blobId}`,
		);
	});

	it("builds the quilt patch route from the 37-byte patch id", () => {
		// A live Testnet patch id, as `/v1/quilts/{id}/patches` lists it.
		const patchId = "LoFCiFAn9m5X4kwNomSLtZ4qGx2IQHIeFExiHrnBHewBAQACAA";
		expect(quiltPatchUrl(TESTNET, patchId)).toBe(
			`https://aggregator.walrus-testnet.walrus.space/v1/blobs/by-quilt-patch-id/${patchId}`,
		);
	});

	it("builds the quilt's patch list route", () => {
		expect(
			quiltPatchesUrl(TESTNET, "LoFCiFAn9m5X4kwNomSLtZ4qGx2IQHIeFExiHrnBHew"),
		).toBe(
			"https://aggregator.walrus-testnet.walrus.space/v1/quilts/LoFCiFAn9m5X4kwNomSLtZ4qGx2IQHIeFExiHrnBHew/patches",
		);
	});

	it("addresses a quilt file by its path, the identifier as one segment", () => {
		// Live Testnet, 2026-10-18: a bare slash answered 404, %2F answered 200
		// with the same bytes as the patch id route (notes UNCONFIRMED item 7).
		const quiltId = "kZ8U7GrABIM_IanO1KxnBjPnJeAOm9jXUi1orsJ3QvE";
		expect(quiltPathUrl(TESTNET, quiltId, "assets/a.txt")).toBe(
			`https://aggregator.walrus-testnet.walrus.space/v1/blobs/by-quilt-id/${quiltId}/assets%2Fa.txt`,
		);
	});

	it("keeps ordinary file names readable", () => {
		const quiltId = "kZ8U7GrABIM_IanO1KxnBjPnJeAOm9jXUi1orsJ3QvE";
		expect(quiltPathUrl(MAINNET, quiltId, "index.html")).toBe(
			`https://aggregator.walrus-mainnet.walrus.space/v1/blobs/by-quilt-id/${quiltId}/index.html`,
		);
		expect(quiltPathUrl(TESTNET, quiltId, "about me.txt")).toBe(
			`https://aggregator.walrus-testnet.walrus.space/v1/blobs/by-quilt-id/${quiltId}/about%20me.txt`,
		);
	});
});
