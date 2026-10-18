import {
	blobByObjectIdUrl,
	blobUrl,
	quiltPatchUrl,
} from "@/blobs/aggregator-urls";

/**
 * Share links (PROTOCOL-NOTES section 10): aggregator links only. A Walrus
 * Site link exists only for a Walrus Sites object, and `wal.app` serves only
 * Walrus Mainnet sites with a SuiNS name, so a blob or quilt has none.
 */

export interface ShareLink {
	/** What the link reads: shown above it. */
	label: string;
	url: string;
}

export type ShareTarget =
	| { kind: "blob"; blobId: string; objectId: string; hasHeaders: boolean }
	| { kind: "patch"; patchId: string };

/**
 * The links for a blob or a quilt file. A blob gets its content-addressed
 * link, plus the by-object-id link when it carries attributes the
 * aggregator serves as headers (its type and file name).
 */
export function shareLinks(
	aggregatorUrl: string,
	target: ShareTarget,
): ShareLink[] {
	if (target.kind === "patch")
		return [
			{
				label: "Aggregator link",
				url: quiltPatchUrl(aggregatorUrl, target.patchId),
			},
		];
	const links: ShareLink[] = [
		{ label: "Aggregator link", url: blobUrl(aggregatorUrl, target.blobId) },
	];
	if (target.hasHeaders)
		links.push({
			label: "With its file type and name",
			url: blobByObjectIdUrl(aggregatorUrl, target.objectId),
		});
	return links;
}

/**
 * An HTML snippet that embeds the file from the aggregator: an image, a
 * video or an audio player by media type, else a plain link.
 */
export function embedSnippet({
	url,
	name,
	contentType,
}: {
	url: string;
	name: string;
	contentType: string | null;
}): string {
	const src = escapeAttribute(url);
	const media = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
	if (media.startsWith("image/"))
		return `<img src="${src}" alt="${escapeAttribute(name)}">`;
	if (media.startsWith("video/"))
		return `<video src="${src}" controls></video>`;
	if (media.startsWith("audio/"))
		return `<audio src="${src}" controls></audio>`;
	return `<a href="${src}">${escapeText(name)}</a>`;
}

function escapeAttribute(value: string): string {
	return escapeText(value).replaceAll('"', "&quot;");
}

function escapeText(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}
