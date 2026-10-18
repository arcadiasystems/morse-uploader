/**
 * What the drawer previews, read through the aggregator: images up to a
 * size the tab can show at once, and the start of text files. Text is
 * always shown as text, never rendered as HTML.
 */

/** Images above this are not drawn in the drawer; Download still works. */
export const MAX_IMAGE_PREVIEW_BYTES = 10_000_000n;
/** Text previews read only this many bytes, with a Range request. */
export const TEXT_PREVIEW_BYTES = 32_768;

export type PreviewPlan =
	| { kind: "image" }
	| { kind: "text"; readBytes: number }
	| { kind: "too-large"; limitBytes: bigint }
	| { kind: "none"; mediaType: string | null };

const TEXT_MEDIA =
	/^(text\/.+|application\/(json|xml|javascript|x-yaml|yaml|toml|x-sh|ld\+json|geo\+json))$/;

const BY_EXTENSION: Readonly<Record<string, string>> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	svg: "image/svg+xml",
	txt: "text/plain",
	md: "text/markdown",
	csv: "text/csv",
	json: "application/json",
	xml: "application/xml",
	yml: "application/yaml",
	yaml: "application/yaml",
	toml: "application/toml",
	html: "text/html",
	css: "text/css",
	js: "application/javascript",
	log: "text/plain",
};

/**
 * The media type of a file: its stored type when it has one, else a guess
 * from the name's extension, else `null`. The guess only picks a preview.
 */
export function mediaTypeOf(
	contentType: string | null,
	name: string,
): string | null {
	const stored = contentType?.split(";")[0]?.trim().toLowerCase();
	if (stored) return stored;
	const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
	return extension ? (BY_EXTENSION[extension] ?? null) : null;
}

/**
 * How to preview a file of `size` bytes with media type `mediaType`. `size`
 * is `null` when it is unknown before reading, as for a file in a quilt.
 */
export function previewPlan(
	mediaType: string | null,
	size: bigint | null,
): PreviewPlan {
	if (mediaType?.startsWith("image/")) {
		if (size !== null && size > MAX_IMAGE_PREVIEW_BYTES)
			return { kind: "too-large", limitBytes: MAX_IMAGE_PREVIEW_BYTES };
		return { kind: "image" };
	}
	if (mediaType && TEXT_MEDIA.test(mediaType))
		return {
			kind: "text",
			readBytes:
				size === null
					? TEXT_PREVIEW_BYTES
					: Math.min(Number(size), TEXT_PREVIEW_BYTES),
		};
	return { kind: "none", mediaType };
}
