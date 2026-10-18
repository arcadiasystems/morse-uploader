/**
 * The blob attributes the Walrus pane reads. Attributes are public on-chain
 * metadata (`Metadata { metadata: VecMap<String, String> }`), so none of
 * these may hold a secret.
 */
export type BlobAttributes = Readonly<Record<string, string>>;

/**
 * Every quilt carries `_walrusBlobType = "quilt"`: the TS SDK, the Rust
 * client and publishers all set it (PROTOCOL-NOTES section 7).
 */
export const BLOB_TYPE_ATTRIBUTE = "_walrusBlobType";
export const QUILT_BLOB_TYPE = "quilt";

/**
 * Walrus has no encryption marker. Morse Uploader marks a Seal-encrypted blob
 * by writing the Seal policy package id under this key at register
 * (PROTOCOL-NOTES section 11, "How encrypted blobs are marked", option 2).
 */
export const SEAL_ATTRIBUTE = "seal";

/** The file name Morse Uploader writes at register. */
export const NAME_ATTRIBUTE = "name";

/**
 * Aggregators serve this attribute as the Content-Type header on
 * `by-object-id` reads (PROTOCOL-NOTES section 10). Morse Uploader writes it
 * for public blobs, and as a patch tag in quilts.
 */
export const CONTENT_TYPE_ATTRIBUTE = "content-type";

/**
 * Aggregators serve this attribute as the Content-Disposition header (docs
 * http-api/reading-blobs), so other tools set it to name a download.
 */
const CONTENT_DISPOSITION_ATTRIBUTE = "content-disposition";

export function isQuilt(attributes: BlobAttributes): boolean {
	return attributes[BLOB_TYPE_ATTRIBUTE] === QUILT_BLOB_TYPE;
}

/** The blob's media type from its `content-type` attribute, or `null`. */
export function contentTypeFromAttributes(
	attributes: BlobAttributes,
): string | null {
	return attributes[CONTENT_TYPE_ATTRIBUTE]?.trim() || null;
}

export function isSealEncrypted(attributes: BlobAttributes): boolean {
	return (attributes[SEAL_ATTRIBUTE] ?? "").trim() !== "";
}

/**
 * The blob's name: the `name` attribute, else the file name in a
 * Content-Disposition attribute, else `null`.
 */
export function nameFromAttributes(attributes: BlobAttributes): string | null {
	const name = attributes[NAME_ATTRIBUTE]?.trim();
	if (name) return name;
	const disposition = attributes[CONTENT_DISPOSITION_ATTRIBUTE];
	return disposition ? fileNameFromContentDisposition(disposition) : null;
}

/**
 * The file name in a Content-Disposition value. The RFC 5987 UTF-8 form
 * (`filename*=UTF-8''...`) wins over `filename="..."` or `filename=...`.
 */
export function fileNameFromContentDisposition(value: string): string | null {
	const extended = /filename\*\s*=\s*utf-8'[^']*'([^;\s]+)/i.exec(value);
	if (extended?.[1]) {
		const decoded = decodePercentEncoded(extended[1]);
		if (decoded) return decoded;
	}
	const quoted = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(value);
	const plain =
		quoted?.[1]?.replace(/\\(.)/g, "$1") ??
		/filename\s*=\s*([^;\s"]+)/i.exec(value)?.[1];
	return plain?.trim() || null;
}

/** Decodes percent-encoding, or returns `null` when the encoding is malformed. */
function decodePercentEncoded(value: string): string | null {
	try {
		return decodeURIComponent(value).trim() || null;
	} catch (error) {
		// A malformed escape is the attribute author's mistake, not a failed
		// read: fall back to the plain filename parameter.
		if (error instanceof URIError) return null;
		throw error;
	}
}
