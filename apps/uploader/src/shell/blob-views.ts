import type { IconName } from "@/components/icon";

/** The Walrus pane's views, picked in the sidebar. */
export const BLOB_VIEWS = {
	all: {
		label: "All blobs",
		icon: "folder",
		empty: "Every blob this wallet owns",
	},
	quilts: {
		label: "Quilts",
		icon: "quilt",
		empty: "Quilts this wallet owns, with the files inside",
	},
	encrypted: {
		label: "Encrypted",
		icon: "lock",
		empty: "Seal-encrypted blobs this wallet owns",
	},
	expiring: {
		label: "Expiring soon",
		icon: "clock",
		empty: "Blobs whose paid storage ends soonest",
	},
	publications: {
		label: "Morse publications",
		icon: "morse",
		empty: "Blobs attached to your Morse publications",
	},
	shared: {
		label: "Shared links",
		icon: "share",
		empty: "Blobs you have shared a link to",
	},
} as const satisfies Record<
	string,
	{ label: string; icon: IconName; empty: string }
>;

export type BlobView = keyof typeof BLOB_VIEWS;
