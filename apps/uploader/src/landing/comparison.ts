export interface ComparisonRow {
	topic: string;
	console: string;
	uploader: string;
}

/**
 * The Console comparison. Every Walrus Console claim is taken from Console's
 * own docs (CONSOLE_SOURCES), and every Morse Uploader claim follows
 * PROTOCOL-NOTES section 13. The design's "Publishing" and "Agents" rows are
 * gone: Console's docs are silent on publishing, and the uploader has no
 * agent access to compare.
 */
export const COMPARISON_ROWS: readonly ComparisonRow[] = [
	{
		topic: "Login",
		console: "Google or Apple account",
		uploader: "Any Sui wallet, no account",
	},
	{
		topic: "Keys and payment",
		console: "Console manages WAL for you",
		uploader: "Your wallet signs every transaction",
	},
	{
		topic: "Limits",
		console: "5 GB per space, 5 folders, 100 MiB per upload",
		uploader: "Up to 1 GiB per file in the browser, no space or folder caps",
	},
	{
		topic: "Folders",
		console: "Encrypted private folders",
		uploader: "Quilts with paths for public folders, Seal per file on Testnet",
	},
	{
		topic: "Expiry",
		console: "Auto-extended by Console",
		uploader:
			"Shown per blob. Extend by hand, or auto-extend while the app is open",
	},
	{
		topic: "Verification",
		console: "Upload status polling",
		uploader: "Re-check any blob against storage nodes",
	},
	{
		topic: "Existing blobs",
		console: "Only files uploaded through Console",
		uploader: "Every Walrus blob your wallet owns, however it was stored",
	},
];

export interface ConsoleSource {
	label: string;
	href: string;
}

/** The Console docs pages the Walrus Console column is read from. */
export const CONSOLE_SOURCES: readonly ConsoleSource[] = [
	{ label: "overview", href: "https://docs.wal.app/docs/console/overview" },
	{ label: "FAQ", href: "https://docs.wal.app/docs/console/faq" },
	{
		label: "storage epochs",
		href: "https://docs.wal.app/docs/console/storage-epochs",
	},
];
