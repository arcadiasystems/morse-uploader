import { fromBase64 } from "@mysten/sui/utils";
import { describe, expect, it } from "vitest";
import { parseBlob, parseMetadataField } from "./parse-blob";

/**
 * Real Testnet objects owned by the e2e wallet, read over gRPC on 2026-10-18.
 * Expected values come from Sui GraphQL's JSON for the same objects, and the
 * quilt's blob id is the one the Testnet aggregator lists patches for.
 */
const QUILT = {
	objectId:
		"0x122788423f0321f82d3810af88aa99da99cfa513c5a511d49912a48e40ad0209",
	contents:
		"EieIQj8DIfgtOBCviKqZ2pnPpRPFpRHUmRKkjkCtAgkpAgAALoFCiFAn9m5X4kwNomSLtZ4qGx2IQHIeFExiHrnBHex0zAYAAAAAAAEBKQIAAFUFAtQ/9omQxs/N/khJwPG9TW9LCubajamn/2LIObiIKQIAACwCAABQme8DAAAAAAE=",
	metadataField:
		"Km1Kiyfxy0AD5R21Xgw0odr6miJOOG2BXpSgWKwBANYIbWV0YWRhdGEBD193YWxydXNCbG9iVHlwZQVxdWlsdA==",
	blobIdDecimal:
		"106798407858364310668632778928167325676894043621520879793674383251222860824878",
	blobId: "LoFCiFAn9m5X4kwNomSLtZ4qGx2IQHIeFExiHrnBHew",
};
const UNCERTIFIED = {
	objectId:
		"0x03d83e841b6015df900d81948405120352b91acd0a911e2e805d28d37590141e",
	contents:
		"A9g+hBtgFd+QDYGUhAUSA1K5Gs0KkR4ugF0o03WQFB7FAQAA6sHecLOtypsROleEcHSd+YF0+x3qcLvyd1c9zgRdZ70TAAAAAAAAAAEA+majTXlGpmubwzfOGaGRZjPJmQeuTjr3g/ElFkb8I2fFAQAAyAEAAFCZ7wMAAAAAAQ==",
	blobIdDecimal:
		"85669755621879125764298798446772191009731343789795035325728439710561536492010",
	blobId: "6sHecLOtypsROleEcHSd-YF0-x3qcLvyd1c9zgRdZ70",
};

/** u256 little-endian to URL-safe base64 without padding, written out independently of the SDK. */
function blobIdFromDecimal(decimal: string): string {
	let value = BigInt(decimal);
	const bytes = new Uint8Array(32);
	for (let index = 0; index < 32; index += 1) {
		bytes[index] = Number(value & 0xffn);
		value >>= 8n;
	}
	return Buffer.from(bytes)
		.toString("base64")
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}

describe("parseBlob", () => {
	it("decodes a certified quilt with its attributes", () => {
		const attributes = parseMetadataField(fromBase64(QUILT.metadataField));
		expect(attributes).toEqual({ _walrusBlobType: "quilt" });
		expect(parseBlob(fromBase64(QUILT.contents), attributes)).toEqual({
			objectId: QUILT.objectId,
			blobId: QUILT.blobId,
			name: null,
			size: 445_556n,
			encodedSize: 66_034_000n,
			deletable: true,
			registeredEpoch: 553,
			certifiedEpoch: 553,
			startEpoch: 553,
			endEpoch: 556,
			isQuilt: true,
			isEncrypted: false,
			contentType: null,
			encodingType: 1,
		});
	});

	it("decodes a registered, never certified blob without attributes", () => {
		const blob = parseBlob(fromBase64(UNCERTIFIED.contents), {});
		expect(blob).toMatchObject({
			objectId: UNCERTIFIED.objectId,
			blobId: UNCERTIFIED.blobId,
			size: 19n,
			certifiedEpoch: null,
			registeredEpoch: 453,
			startEpoch: 453,
			endEpoch: 456,
			isQuilt: false,
			isEncrypted: false,
		});
	});

	it("converts the on-chain u256 blob id with blobIdFromInt, as aggregators expect", () => {
		for (const fixture of [QUILT, UNCERTIFIED]) {
			expect(blobIdFromDecimal(fixture.blobIdDecimal)).toBe(fixture.blobId);
			expect(parseBlob(fromBase64(fixture.contents), {}).blobId).toBe(
				fixture.blobId,
			);
		}
	});

	it("takes the name and the Seal marker from the attributes", () => {
		const blob = parseBlob(fromBase64(UNCERTIFIED.contents), {
			name: "hero.png",
			seal: "0x468727724e86b7d305e961aee73ef9d868b4b68478952fc23748ef4ccfcaf4b2",
		});
		expect(blob.name).toBe("hero.png");
		expect(blob.isEncrypted).toBe(true);
		expect(blob.contentType).toBeNull();
	});

	it("takes the media type from the content-type attribute", () => {
		const blob = parseBlob(fromBase64(UNCERTIFIED.contents), {
			"content-type": " image/png ",
		});
		expect(blob.contentType).toBe("image/png");
		expect(blob.encodingType).toBe(1);
	});

	it("rejects bytes that are not a Blob", () => {
		expect(() => parseBlob(new Uint8Array(10), {})).toThrow();
	});
});
