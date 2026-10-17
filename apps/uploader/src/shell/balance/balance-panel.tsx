import type { RefObject } from "react";
import { Icon } from "@/components/icon";
import { TokenAmount } from "@/components/token-amount";
import type { Funds } from "@/funds/use-funds";
import type { NetworkConfig } from "@/network/networks";
import { CopyAddressButton } from "./copy-address-button";
import { ReadStatus } from "./read-status";

interface BalancePanelProps {
	id: string;
	panelRef: RefObject<HTMLDivElement | null>;
	funds: Funds;
	network: NetworkConfig;
	address: string;
}

/** Exact balances, the low-funds explanation and honest top-up destinations. */
export function BalancePanel({
	id,
	panelRef,
	funds,
	network,
	address,
}: BalancePanelProps) {
	const { balances, floor, assessment } = funds;
	const wal = balances.status === "ready" ? balances.data.wal : null;
	const sui = balances.status === "ready" ? balances.data.sui : null;
	const refreshing =
		balances.status === "loading" ||
		(balances.status === "ready" && balances.refreshing);

	return (
		<div
			ref={panelRef}
			id={id}
			className="pop end"
			role="dialog"
			aria-label="Balances and top up"
		>
			<section className="sec">
				<div className="sec-hd">
					<h4>Balances on {network.label}</h4>
					<button
						className="btn btn-ghost xs"
						type="button"
						disabled={refreshing}
						onClick={funds.refresh}
					>
						<Icon name="refresh" size={13} />
						Refresh
					</button>
				</div>
				<dl className="amounts">
					<div className={assessment?.walLow ? "low" : undefined}>
						<dt>WAL</dt>
						<dd className="mono">
							<TokenAmount raw={wal} context="detailed" />
						</dd>
					</div>
					<div className={assessment?.suiLow ? "low" : undefined}>
						<dt>SUI</dt>
						<dd className="mono">
							<TokenAmount raw={sui} context="detailed" />
						</dd>
					</div>
				</dl>
				<ReadStatus read={balances} subject="balances" />
			</section>

			{assessment?.low && floor ? (
				<section className="sec">
					<div className="callout warn" role="status">
						<b>Top up to upload on {network.label}</b>
						{assessment.walLow ? (
							<p>
								The smallest upload costs{" "}
								<TokenAmount raw={floor.walFrost} context="detailed" /> WAL for
								one epoch at the current price. This wallet has{" "}
								<TokenAmount raw={wal} context="detailed" /> WAL.
							</p>
						) : null}
						{assessment.suiLow ? (
							<p>
								An upload's two transactions need about{" "}
								<TokenAmount raw={floor.suiMist} context="compact" /> SUI in
								network fees. This wallet has{" "}
								<TokenAmount raw={sui} context="detailed" /> SUI.
							</p>
						) : null}
					</div>
				</section>
			) : null}

			<section className="sec">
				<h4>Top up on {network.label}</h4>
				<ul className="links">
					{network.topUp.map((link) => (
						<li key={link.href}>
							<a href={link.href} target="_blank" rel="noopener noreferrer">
								<span>
									<b>{link.title}</b>
									<small>{link.detail}</small>
								</span>
								<Icon name="external" size={14} />
								<span className="sr-only">(opens in a new tab)</span>
							</a>
						</li>
					))}
				</ul>
				<code className="addr">{address}</code>
				<div className="row-acts">
					<CopyAddressButton address={address} />
				</div>
			</section>

			<section className="sec">
				<p className="note">
					{floor ? (
						<>
							Low funds means this wallet cannot pay for one upload of the
							smallest file for one epoch:{" "}
							<TokenAmount raw={floor.walFrost} context="detailed" /> WAL in
							storage and write fees, priced live from the Walrus system object,
							and about <TokenAmount raw={floor.suiMist} context="compact" />{" "}
							SUI in network fees for its two transactions.
						</>
					) : (
						<>
							Low funds means this wallet cannot pay for one upload of the
							smallest file for one epoch. Walrus prices are not available yet,
							so the check is waiting.
						</>
					)}
				</p>
			</section>
		</div>
	);
}
