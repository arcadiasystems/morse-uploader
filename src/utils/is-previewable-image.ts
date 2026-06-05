/** Content types the downloader renders inline as an image preview. */
const PREVIEWABLE_IMAGE_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"image/avif",
	"image/svg+xml",
]);

/** True when a content type is a browser-previewable image. */
export function isPreviewableImage(contentType: string): boolean {
	return PREVIEWABLE_IMAGE_TYPES.has(contentType.toLowerCase());
}
