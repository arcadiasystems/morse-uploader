import { Brand } from "@/components/brand";
import { Icon } from "@/components/icon";
import type { Funds } from "@/funds/use-funds";
import type { NetworkConfig } from "@/network/networks";
import { BalancePill } from "./balance/balance-pill";
import { NetworkChip } from "./network-chip";
import { ProfileMenu } from "./profile-menu/profile-menu";
import { SearchField } from "./search-field";
import { type Popover, usePopover } from "./use-popover";

interface TopbarProps {
	network: NetworkConfig;
	address: string | null;
	funds: Funds;
	profileMenu: Popover;
	query: string;
	onQueryChange: (query: string) => void;
	/** Search is off until there are listed blobs to search. */
	searchDisabled: boolean;
}

/** Brand, profile, network, search, balances and the upload action. */
export function Topbar({
	network,
	address,
	funds,
	profileMenu,
	query,
	onQueryChange,
	searchDisabled,
}: TopbarProps) {
	const balanceMenu = usePopover();
	return (
		<header className="topbar">
			<Brand />
			<span className="sep" aria-hidden="true" />
			<ProfileMenu popover={profileMenu} />
			<NetworkChip network={network} />
			<SearchField
				query={query}
				onQueryChange={onQueryChange}
				disabled={searchDisabled}
			/>
			<div className="right">
				{address ? (
					<BalancePill
						popover={balanceMenu}
						funds={funds}
						network={network}
						address={address}
					/>
				) : null}
				<button
					className="btn btn-ultra upload"
					type="button"
					disabled
					aria-label="Upload"
				>
					<Icon name="upload" />
					<span className="lbl">Upload</span>
				</button>
			</div>
		</header>
	);
}
