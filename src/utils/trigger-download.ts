/**
 * Trigger a browser download of an object URL under a given filename. Creates a
 * transient anchor, clicks it, and removes it. No-op outside a DOM.
 */
export function triggerDownload(objectUrl: string, filename: string): void {
	if (typeof document === "undefined") {
		return;
	}
	const anchor = document.createElement("a");
	anchor.href = objectUrl;
	anchor.download = filename;
	anchor.rel = "noopener";
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
}
