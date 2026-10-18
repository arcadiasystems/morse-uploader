import type { IconName } from "./icon";

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|heic)$/i;

/** The icon for a file by its name: a picture for images, a page for the rest. */
export function fileIcon(name: string): IconName {
	return IMAGE_EXTENSION.test(name) ? "image" : "file";
}
