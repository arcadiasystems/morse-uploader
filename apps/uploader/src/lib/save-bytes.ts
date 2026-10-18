/**
 * Hands bytes to the browser as a download named `fileName`. A same-origin
 * object URL is used because the `download` attribute is ignored on
 * cross-origin links such as the aggregator's.
 */
export function saveBytes(
	bytes: Uint8Array<ArrayBuffer> | Blob,
	fileName: string,
	mediaType: string | null,
): void {
	const blob =
		bytes instanceof Blob
			? bytes
			: new Blob([bytes], { type: mediaType ?? "application/octet-stream" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.rel = "noopener";
	document.body.append(link);
	link.click();
	link.remove();
	// The click has started the download; the URL is no longer needed.
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Fetches a file from the aggregator and saves it.
 * @throws {Error} When the aggregator does not serve it.
 */
export async function downloadFromAggregator(
	url: string,
	fileName: string,
	mediaType: string | null,
): Promise<void> {
	const response = await fetch(url);
	if (!response.ok)
		throw new Error(`The aggregator answered ${response.status}.`);
	saveBytes(await response.blob(), fileName, mediaType);
}
