import type { BlobFilter } from "@/blobs/filter-rows";
import type { IconName } from "@/components/icon";

interface FilterConfig {
	label: string;
	icon: IconName;
	/** The empty state when the filter lists nothing. */
	emptyTitle: string;
	empty: string;
}

/** The Files filter chips, in the design's order. */
export const FILE_FILTER_CONFIG: Readonly<Record<BlobFilter, FilterConfig>> = {
	all: {
		label: "All",
		icon: "folder",
		emptyTitle: "No blobs yet",
		empty:
			"Every blob this wallet owns appears here, with what it stores and how long it is paid for.",
	},
	quilts: {
		label: "Quilts",
		icon: "quilt",
		emptyTitle: "No quilts",
		empty: "Folders upload as quilts, listed here with the files inside.",
	},
	encrypted: {
		label: "Encrypted",
		icon: "lock",
		emptyTitle: "No encrypted blobs",
		empty:
			"Blobs encrypted with Seal before upload show a lock and are listed here.",
	},
	expiring: {
		label: "Expiring",
		icon: "clock",
		emptyTitle: "Nothing expires within 30 days",
		empty:
			"Certified blobs whose paid storage ends within 30 days are listed here.",
	},
	published: {
		label: "Published",
		icon: "morse",
		emptyTitle: "Nothing published",
		empty:
			"Blobs a public entry points at, in a Morse publication this wallet owns or writes to. Publish one from its details.",
	},
	shared: {
		label: "Shared",
		icon: "share",
		emptyTitle: "Nothing shared",
		empty:
			"Encrypted blobs whose access policy lets someone besides you decrypt them. Add a recipient from an encrypted blob's details.",
	},
};
