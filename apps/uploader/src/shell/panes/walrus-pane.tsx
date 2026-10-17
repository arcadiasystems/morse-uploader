import type { WalrusPrices } from "@/funds/types";
import { shortenAddress } from "@/lib/shorten-address";
import type { ChainRead } from "@/lib/use-chain-read";
import type { NetworkConfig } from "@/network/networks";
import { BLOB_VIEWS, type BlobView } from "../blob-views";
import { EmptyState } from "../empty-state";
import { PriceFooter } from "./price-footer";
import { ViewToggle } from "./view-toggle";

interface WalrusPaneProps {
	network: NetworkConfig;
	address: string | null;
	view: BlobView;
	prices: ChainRead<WalrusPrices>;
	onConnect: () => void;
}

const BLOB_ACTIONS = [
	"Download",
	"Extend",
	"Share",
	"Verify",
	"Publish to Morse",
] as const;

/**
 * The wallet's blobs on the current network. Actions need a selection, so
 * they stay disabled until the list has blobs to pick.
 */
export function WalrusPane({
	network,
	address,
	view,
	prices,
	onConnect,
}: WalrusPaneProps) {
	const chainState =
		prices.status === "ready"
			? "ok"
			: prices.status === "error"
				? "warn"
				: "wait";
	return (
		<section className="pane remote" aria-labelledby="pane-walrus-title">
			<div className="hd">
				<h3 id="pane-walrus-title">
					<i className={chainState} aria-hidden="true" />
					{network.walrusLabel}
				</h3>
				<span className="crumb">
					{address ? shortenAddress(address) : "Not connected"} /{" "}
					<b>{BLOB_VIEWS[view].label}</b>
				</span>
				<div className="acts">
					<button className="btn btn-soft xs" type="button" disabled>
						Refresh
					</button>
				</div>
			</div>
			<div className="tools">
				{BLOB_ACTIONS.map((action) => (
					<button
						key={action}
						className="btn btn-ghost xs"
						type="button"
						disabled
					>
						{action}
					</button>
				))}
				<span className="sp" />
				<ViewToggle />
			</div>
			<div className="list">
				{address ? (
					<EmptyState
						icon={BLOB_VIEWS[view].icon}
						title="Your blobs appear here"
					>
						{BLOB_VIEWS[view].empty} on {network.walrusLabel}, with status and
						expiry.
					</EmptyState>
				) : (
					<EmptyState
						icon="wallet"
						title="Connect a wallet"
						action={
							<button className="btn btn-ink" type="button" onClick={onConnect}>
								Connect wallet
							</button>
						}
					>
						Your blobs on {network.walrusLabel} appear here. Morse Uploader
						never holds your keys; your wallet signs every transaction.
					</EmptyState>
				)}
			</div>
			<PriceFooter prices={prices} />
		</section>
	);
}
