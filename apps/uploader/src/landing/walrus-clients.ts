import { APP_PATH } from "./links";

export interface WalrusClient {
	id: "console" | "uploader";
	name: string;
	title: string;
	body: string;
	bestFor: string;
	/** "app" opens the uploader in this site; "docs" leaves for Console's docs. */
	action: { kind: "app" | "docs"; label: string; href: string };
}

/** The Console docs pages the Walrus Console card is read from. */
export const CONSOLE_SOURCES = [
	{ label: "overview", href: "https://docs.wal.app/docs/console/overview" },
	{ label: "FAQ", href: "https://docs.wal.app/docs/console/faq" },
	{
		label: "storage epochs",
		href: "https://docs.wal.app/docs/console/storage-epochs",
	},
] as const;

/**
 * Walrus Console and Morse Uploader as two ways into the same network, not
 * rivals: Console is Walrus's own product, and the uploader complements it.
 * Every Console sentence comes from Console's docs (CONSOLE_SOURCES), and
 * every uploader sentence follows PROTOCOL-NOTES section 13.
 */
export const WALRUS_CLIENTS: readonly WalrusClient[] = [
	{
		id: "console",
		name: "Walrus Console",
		title: "A hosted drive on Walrus",
		body: "Sign in with Google or Apple. Console handles WAL and renews storage for you, and keeps every folder private and encrypted with Seal.",
		bestFor: "Best when you want storage without managing a wallet.",
		action: {
			kind: "docs",
			label: "Read about Walrus Console",
			href: CONSOLE_SOURCES[0].href,
		},
	},
	{
		id: "uploader",
		name: "Morse Uploader",
		title: "A client for your wallet",
		body: "Connect any Sui wallet and sign each step yourself. See every blob it owns, however it was stored, and keep each one alive. Up to 1 GiB per file in the browser.",
		bestFor: "Best when your wallet should hold the keys.",
		action: { kind: "app", label: "Open Morse Uploader", href: APP_PATH },
	},
];
