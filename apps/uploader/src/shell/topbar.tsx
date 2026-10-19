import { Icon } from "@/components/icon";
import type { Funds } from "@/funds/use-funds";
import type { NetworkConfig } from "@/network/networks";
import type { TransfersSummary } from "@/transfers/summarize-transfers";
import { BalancePill } from "./balance/balance-pill";
import { NetworkChip } from "./network-chip";
import { TransfersPill } from "./transfers/transfers-pill";
import type { Popover } from "./use-popover";

interface TopbarProps {
	/** The view's name. */
	title: string;
	/** One line under it: the address, how many blobs and their total size. */
	context: string;
	network: NetworkConfig;
	address: string | null;
	funds: Funds;
	balanceMenu: Popover;
	/** Opens the command palette, as ⌘K does. */
	onPalette: () => void;
	paletteOpen: boolean;
	transfers: TransfersSummary;
	/** Seconds of uploading left, for the transfers pill. */
	transfersRemaining: number | null;
	transfersPanel: Popover;
	/** Opens the file picker; what is picked goes to the staging tray. */
	onUpload: () => void;
}

/** The view title and context, the palette's field, transfers, balances and the upload action. */
export function Topbar({
	title,
	context,
	network,
	address,
	funds,
	balanceMenu,
	onPalette,
	paletteOpen,
	transfers,
	transfersRemaining,
	transfersPanel,
	onUpload,
}: TopbarProps) {
	return (
		<header className="top">
			<div className="title">
				<h1>{title}</h1>
				<span className="ctx">{context}</span>
			</div>
			<button
				className="cmd"
				type="button"
				aria-haspopup="dialog"
				aria-expanded={paletteOpen}
				aria-keyshortcuts="Meta+K Control+K"
				onClick={onPalette}
			>
				<span aria-hidden="true">⌕</span>
				<span className="ph">Search blobs, quilts, ids, or type a command</span>
				<span className="keys" aria-hidden="true">
					<kbd>⌘K</kbd>
				</span>
			</button>
			<div className="r">
				<button
					className="cmd-icon"
					type="button"
					aria-label="Search and commands"
					aria-haspopup="dialog"
					aria-expanded={paletteOpen}
					onClick={onPalette}
				>
					<Icon name="search" size={16} />
				</button>
				<TransfersPill
					summary={transfers}
					remainingSeconds={transfersRemaining}
					panel={transfersPanel}
				/>
				{address ? (
					<BalancePill
						popover={balanceMenu}
						funds={funds}
						network={network}
						address={address}
					/>
				) : (
					<NetworkChip network={network} />
				)}
				<button
					className="btn primary upload"
					type="button"
					disabled={address === null}
					title={address === null ? "Connect a wallet to upload" : undefined}
					aria-label="Upload"
					onClick={onUpload}
				>
					<Icon name="upload" size={14} />
					<span className="lbl">Upload</span>
				</button>
			</div>
		</header>
	);
}
