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

/** WAL and SUI for the active address; turns to "top up" when funds are low. */
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
				className={low ? "bal low" : "bal"}
				aria-haspopup="dialog"
				aria-expanded={popover.isOpen}
				aria-controls={popover.isOpen ? popover.id : undefined}
				onClick={popover.toggle}
			>
				<b>
					<TokenAmount raw={wal} context="compact" /> WAL
				</b>
				<span aria-hidden="true">·</span>
				<b>
					<TokenAmount raw={sui} context="compact" /> SUI
				</b>
				<span aria-hidden="true">·</span>
				<span className="hint">{low ? "top up" : "balances"}</span>
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
