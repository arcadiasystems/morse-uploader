import { Icon } from "@/components/icon";
import type { Funds } from "@/funds/use-funds";
import type { NetworkConfig } from "@/network/networks";
import type { TransfersSummary } from "@/transfers/summarize-transfers";
import { BalancePill } from "./balance/balance-pill";
import { NetworkChip } from "./network-chip";
import { SearchField } from "./search-field";
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
	query: string;
	onQueryChange: (query: string) => void;
	/** Search is off until there are listed blobs to search. */
	searchDisabled: boolean;
	transfers: TransfersSummary;
	transfersPanel: Popover;
	/** Opens the file picker; what is picked goes to the upload sheet. */
	onUpload: () => void;
}

/** The view title and context, search, transfers, balances and the upload action. */
export function Topbar({
	title,
	context,
	network,
	address,
	funds,
	balanceMenu,
	query,
	onQueryChange,
	searchDisabled,
	transfers,
	transfersPanel,
	onUpload,
}: TopbarProps) {
	return (
		<header className="top">
			<div className="title">
				<h1>{title}</h1>
				<span className="ctx">{context}</span>
			</div>
			<SearchField
				query={query}
				onQueryChange={onQueryChange}
				disabled={searchDisabled}
			/>
			<div className="r">
				<TransfersPill summary={transfers} panel={transfersPanel} />
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
