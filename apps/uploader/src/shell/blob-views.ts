import type { BlobFilter } from "@/blobs/filter-rows";
import type { IconName } from "@/components/icon";

interface BlobViewConfig {
	label: string;
	icon: IconName;
	/** The blobs this view lists; `null` while its data source is not built yet. */
	filter: BlobFilter | null;
	/** The empty state when the view lists nothing. */
	emptyTitle: string;
	empty: string;
}

/** The Walrus pane's views, picked in the sidebar. */
export const BLOB_VIEWS = {
	all: {
		label: "All blobs",
		icon: "folder",
		filter: "all",
		emptyTitle: "No blobs yet",
		empty:
			"Every blob this wallet owns appears here, with its status and expiry.",
	},
	quilts: {
		label: "Quilts",
		icon: "quilt",
		filter: "quilts",
		emptyTitle: "No quilts",
		empty: "Folders upload as quilts, listed here with the files inside.",
	},
	encrypted: {
		label: "Encrypted",
		icon: "lock",
		filter: "encrypted",
		emptyTitle: "No encrypted blobs",
		empty:
			"Blobs encrypted with Seal before upload show a lock and are listed here.",
	},
	expiring: {
		label: "Expiring soon",
		icon: "clock",
		filter: "expiring",
		emptyTitle: "Nothing expires within 30 days",
		empty:
			"Certified blobs whose paid storage ends within 30 days are listed here.",
	},
	expired: {
		label: "Expired",
		icon: "archive",
		filter: "expired",
		emptyTitle: "No expired blobs",
		empty:
			"Blobs whose storage has ended stay listed here, with their record on Sui.",
	},
	publications: {
		label: "Morse publications",
		icon: "morse",
		filter: null,
		emptyTitle: "Morse publications",
		empty:
			"Blobs attached to your Morse publications appear here once publishing arrives.",
	},
	shared: {
		label: "Shared links",
		icon: "share",
		filter: null,
		emptyTitle: "Shared links",
		empty: "Blobs you share a link to appear here once sharing arrives.",
	},
} as const satisfies Record<string, BlobViewConfig>;

export type BlobView = keyof typeof BLOB_VIEWS;
