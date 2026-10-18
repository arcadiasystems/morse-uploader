import { TokenAmount } from "@/components/token-amount";
import type { Funds } from "@/funds/use-funds";
import type { NetworkConfig } from "@/network/networks";
import type { Popover } from "../use-popover";
import { BalancePanel } from "./balance-panel";

interface BalancePillProps {
	popover: Popover;
	funds: Funds;
	network: NetworkConfig;
	address: string;
}

/** WAL, SUI and the network for the active address; turns amber with "top up" when funds are low. */
export function BalancePill({
	popover,
	funds,
	network,
	address,
}: BalancePillProps) {
	const { balances, assessment } = funds;
	const low = assessment?.low ?? false;
	const wal = balances.status === "ready" ? balances.data.wal : null;
	const sui = balances.status === "ready" ? balances.data.sui : null;

	return (
		<div className="anchor">
			<button
				ref={popover.triggerRef}
				type="button"
				className={low ? "net low" : "net"}
				aria-haspopup="dialog"
				aria-expanded={popover.isOpen}
				aria-controls={popover.isOpen ? popover.id : undefined}
				onClick={popover.toggle}
			>
				<i aria-hidden="true" />
				<b>
					<TokenAmount raw={wal} context="compact" /> WAL
				</b>
				<span className="rest">
					<span aria-hidden="true"> · </span>
					<TokenAmount raw={sui} context="compact" /> SUI
					<span aria-hidden="true"> · </span>
					{network.label}
				</span>
				{low ? (
					<span className="hint">
						<span aria-hidden="true"> · </span>top up
					</span>
				) : null}
			</button>
			{popover.isOpen ? (
				<BalancePanel
					id={popover.id}
					panelRef={popover.panelRef}
					funds={funds}
					network={network}
					address={address}
				/>
			) : null}
		</div>
	);
}
