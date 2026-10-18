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
}

/** Brand, profile, network, search, balances and the upload action. */
export function Topbar({ network, address, funds, profileMenu }: TopbarProps) {
	const balanceMenu = usePopover();
	return (
		<header className="topbar">
			<Brand />
			<span className="sep" aria-hidden="true" />
			<ProfileMenu popover={profileMenu} />
			<NetworkChip network={network} />
			<SearchField />
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
