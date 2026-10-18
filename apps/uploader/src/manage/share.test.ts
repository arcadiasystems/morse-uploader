import { describe, expect, it } from "vitest";
import { NETWORKS } from "@/network/networks";
import { embedSnippet, shareLinks } from "./share";

const AGG = NETWORKS.testnet.aggregatorUrl;
const BLOB_ID = "ZwUNtNTiVu-7D1oLE11YPOh5_l2am8_Gwt_HQ_AvPZ8";
const OBJECT_ID =
	"0x5d9412aaa64c40b469c5231306bc1f474cf6d8acf625cff85629b5784584217f";
const PATCH_ID = "LoFCiFAn9m5X4kwNomSLtZ4qGx2IQHIeFExiHrnBHewBAQACAA";

describe("shareLinks (PROTOCOL-NOTES section 10)", () => {
	it("links a blob by its blob id", () => {
		expect(
			shareLinks(AGG, {
				kind: "blob",
				blobId: BLOB_ID,
				objectId: OBJECT_ID,
				hasHeaders: false,
			}),
		).toEqual([
			{ label: "Aggregator link", url: `${AGG}/v1/blobs/${BLOB_ID}` },
		]);
	});

	it("adds the by-object-id link when attributes give it a type and name", () => {
		const links = shareLinks(AGG, {
			kind: "blob",
			blobId: BLOB_ID,
			objectId: OBJECT_ID,
			hasHeaders: true,
		});
		expect(links.map((link) => link.url)).toEqual([
			`${AGG}/v1/blobs/${BLOB_ID}`,
			`${AGG}/v1/blobs/by-object-id/${OBJECT_ID}`,
		]);
	});

	it("links a quilt file by its patch id", () => {
		expect(shareLinks(AGG, { kind: "patch", patchId: PATCH_ID })).toEqual([
			{
				label: "Aggregator link",
				url: `${AGG}/v1/blobs/by-quilt-patch-id/${PATCH_ID}`,
			},
		]);
	});

	it("never offers a Walrus Site link", () => {
		const urls = shareLinks(AGG, { kind: "patch", patchId: PATCH_ID }).map(
			(link) => link.url,
		);
		expect(urls.some((url) => url.includes("wal.app"))).toBe(false);
	});
});

describe("embedSnippet", () => {
	const url = `${AGG}/v1/blobs/${BLOB_ID}`;

	it("embeds images, video and audio by media type", () => {
		expect(
			embedSnippet({ url, name: "hero.png", contentType: "image/png" }),
		).toBe(`<img src="${url}" alt="hero.png">`);
		expect(
			embedSnippet({
				url,
				name: "clip.mp4",
				contentType: "video/mp4; codecs=avc1",
			}),
		).toBe(`<video src="${url}" controls></video>`);
		expect(
			embedSnippet({ url, name: "a.mp3", contentType: "audio/mpeg" }),
		).toBe(`<audio src="${url}" controls></audio>`);
	});

	it("links anything else", () => {
		expect(embedSnippet({ url, name: "notes.md", contentType: null })).toBe(
			`<a href="${url}">notes.md</a>`,
		);
	});

	it("escapes names so a file name cannot inject markup", () => {
		expect(
			embedSnippet({
				url,
				name: '"><script>x</script>',
				contentType: "image/png",
			}),
		).toBe(`<img src="${url}" alt="&quot;&gt;&lt;script&gt;x&lt;/script&gt;">`);
		expect(embedSnippet({ url, name: "a&b <c>", contentType: null })).toBe(
			`<a href="${url}">a&amp;b &lt;c&gt;</a>`,
		);
	});
});
