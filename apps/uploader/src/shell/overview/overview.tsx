import type { ReactNode } from "react";
import type { ActivityItem } from "@/activity/activity";
import type { ListedBlobs } from "@/blobs/list-blobs";
import {
	type OverviewSummary,
	summarizeOverview,
} from "@/blobs/overview-summary";
import type { BlobListing } from "@/blobs/use-blob-listing";
import { TokenAmount } from "@/components/token-amount";
import type { WalrusPrices } from "@/funds/types";
import { errorMessage } from "@/lib/error-message";
import { formatBytes } from "@/lib/format-bytes";
import { formatDays, formatShortDate } from "@/lib/format-date";
import type { ChainRead } from "@/lib/use-chain-read";
import type { PickedFile } from "@/local/local-library";
import { planBulkExtend } from "@/manage/bulk-extend";
import type { MorseReads } from "@/morse/use-morse-reads";
import type { NetworkConfig } from "@/network/networks";
import type { FilePickers } from "../file-pickers";
import { ActivityCard } from "./activity-card";
import { DropCard } from "./drop-card";
import { ExpiryTimelineCard } from "./expiry-timeline-card";
import { PublishedCard } from "./published-card";

interface OverviewProps {
	network: NetworkConfig;
	address: string | null;
	listing: ChainRead<BlobListing>;
	listed: ListedBlobs | null;
	prices: ChainRead<WalrusPrices>;
	activity: ChainRead<ActivityItem[]>;
	morse: MorseReads;
	/** `null` while no wallet can sign. */
	onExtendExpiring: (() => void) | null;
	/** Opens the balances panel with its top-up links; `null` without a wallet. */
	onTopUp: (() => void) | null;
	onConnect: () => void;
	onRetryBlobs: () => void;
	onRetryActivity: () => void;
	onShowPublished: () => void;
	pickers: FilePickers;
	onPicked: (files: PickedFile[]) => void;
}

/**
 * The Overview, the home (design/v2/app-overview.html): what the wallet
 * stores, how long it is paid for, the price now, the expiry timeline, a
 * drop zone, recent activity and what is published through Morse. Every
 * number comes from chain.
 */
export function Overview(props: OverviewProps) {
	const { network, address, listing, listed, prices } = props;
	if (address === null) {
		return (
			<div className="content">
				<section className="view" aria-label="Overview">
					<div className="ov">
						<div className="card glass span-8 hello">
							<span className="eyebrow">Transfer client for Walrus</span>
							<h2>Connect a wallet</h2>
							<p>
								Your blobs on {network.walrusLabel} appear here, with what they
								cost and how long they are paid for. Morse Uploader never holds
								your keys; your wallet signs every transaction.
							</p>
							<div className="acts">
								<button
									className="btn solid sm"
									type="button"
									onClick={props.onConnect}
								>
									Connect wallet
								</button>
							</div>
						</div>
						<PriceCard network={network} prices={prices} onTopUp={null} />
					</div>
				</section>
			</div>
		);
	}
	const summary = listed ? summarizeOverview(listed.rows) : null;
	return (
		<div className="content">
			<section className="view" aria-label="Overview">
				<div className="ov">
					{listing.status === "error" ? (
						<div className="card span-8">
							<h4>Your blobs</h4>
							<p className="problem" role="alert">
								Could not read your blobs: {errorMessage(listing.error)}
							</p>
							<div className="acts">
								<button
									className="btn sm"
									type="button"
									onClick={props.onRetryBlobs}
								>
									Try again
								</button>
							</div>
						</div>
					) : (
						<>
							<StoredCard summary={summary} />
							<PaidThroughCard
								network={network}
								listed={listed}
								summary={summary}
								prices={prices}
								onExtendExpiring={props.onExtendExpiring}
							/>
						</>
					)}
					<PriceCard
						network={network}
						prices={prices}
						onTopUp={props.onTopUp}
					/>
					<ExpiryTimelineCard network={network} listed={listed} />
					<DropCard pickers={props.pickers} onPicked={props.onPicked} />
					<ActivityCard
						network={network}
						activity={props.activity}
						listed={listed}
						morse={props.morse}
						onRetry={props.onRetryActivity}
					/>
					<PublishedCard
						network={network}
						publications={props.morse.publications}
						listed={listed}
						onRetry={props.morse.refresh}
						onShowPublished={props.onShowPublished}
					/>
				</div>
			</section>
		</div>
	);
}

/** A big display number with its unit, as the design sets it: `1.94` `GB`. */
function Big({ value, unit }: { value: ReactNode; unit: string }) {
	return (
		<div className="big">
			{value}
			<i>{unit}</i>
		</div>
	);
}

function Placeholder() {
	return <div className="big skel" aria-hidden="true" />;
}

function StoredCard({ summary }: { summary: OverviewSummary | null }) {
	if (summary === null) {
		return (
			<div className="card glass span-4" aria-busy="true">
				<h4>Stored by this wallet</h4>
				<Placeholder />
				<p>Reading your blobs from chain…</p>
			</div>
		);
	}
	const { stored, expired, unfinished } = summary;
	const [amount = "0", unit = "B"] = formatBytes(stored.size).split(" ");
	const others = [
		expired > 0 ? `${expired} expired` : null,
		unfinished > 0 ? `${unfinished} not certified` : null,
	].filter((part) => part !== null);
	return (
		<div
			className="card glass span-4"
			data-stored-bytes={stored.size.toString()}
			data-stored-blobs={stored.blobs}
		>
			<h4>Stored by this wallet</h4>
			<Big value={amount} unit={unit} />
			<p>
				{count(stored.blobs, "blob")} · {count(stored.quilts, "quilt")} ·{" "}
				{stored.encrypted} encrypted
			</p>
			<p className="fine">
				{formatBytes(stored.encodedSize)} encoded and paid for
				{others.length > 0 ? ` · ${others.join(", ")}` : ""}
			</p>
		</div>
	);
}

function PaidThroughCard({
	network,
	listed,
	summary,
	prices,
	onExtendExpiring,
}: {
	network: NetworkConfig;
	listed: ListedBlobs | null;
	summary: OverviewSummary | null;
	prices: ChainRead<WalrusPrices>;
	onExtendExpiring: (() => void) | null;
}) {
	if (summary === null || listed === null) {
		return (
			<div className="card span-4" aria-busy="true">
				<h4>Storage paid through</h4>
				<Placeholder />
				<p>Reading end epochs from chain…</p>
			</div>
		);
	}
	const { firstEnd, expiringSoon } = summary;
	if (firstEnd === null) {
		return (
			<div className="card span-4">
				<h4>Storage paid through</h4>
				<Big value="0" unit="days" />
				<p>No certified blob is paid for right now.</p>
			</div>
		);
	}
	const { value, unit } = daysParts(firstEnd.daysLeft);
	const plan =
		prices.status === "ready" && expiringSoon.length > 0
			? planBulkExtend({
					rows: expiringSoon,
					epochs: 1,
					clock: listed.clock,
					maxEpochsAhead: network.maxEpochsAhead,
					pricePerUnit: prices.data.storagePerUnit,
					capFrost: null,
				})
			: null;
	const items = plan?.items ?? [];
	const cost = plan?.totalFrost ?? 0n;
	return (
		<div className="card span-4" data-first-end-epoch={firstEnd.endEpoch}>
			<h4>Storage paid through</h4>
			<Big value={value} unit={unit} />
			<p>
				Every stored blob is paid until epoch {firstEnd.endEpoch} starts, about{" "}
				{formatShortDate(firstEnd.expiresAtMs, listed.nowMs)}.{" "}
				{expiringSoon.length === 0
					? "None ends within 30 days."
					: `${expiringSoon.length} ${expiringSoon.length === 1 ? "ends" : "end"} within 30 days.`}
			</p>
			{expiringSoon.length > 0 && onExtendExpiring ? (
				<div className="acts">
					<button
						className="btn primary sm"
						type="button"
						onClick={onExtendExpiring}
					>
						{items.length === 0
							? `Extend the ${expiringSoon.length}`
							: `Extend the ${items.length} by 1 epoch · `}
						{items.length === 0 ? null : (
							<>
								<TokenAmount raw={cost} context="compact" /> WAL
							</>
						)}
					</button>
				</div>
			) : null}
		</div>
	);
}

/** Bytes in a GiB of encoded size, from the price's MiB unit. */
const MIB_PER_GIB = 1024n;

function PriceCard({
	network,
	prices,
	onTopUp,
}: {
	network: NetworkConfig;
	prices: ChainRead<WalrusPrices>;
	onTopUp: (() => void) | null;
}) {
	const epoch =
		network.epochDays === 1 ? "1-day epoch" : `${network.epochDays}-day epoch`;
	return (
		<div className="card span-4">
			<h4>Price right now</h4>
			{prices.status === "ready" ? (
				<>
					<Big
						value={
							<TokenAmount
								raw={prices.data.storagePerUnit * MIB_PER_GIB}
								context="compact"
							/>
						}
						unit="WAL / GiB·epoch"
					/>
					<p>Per encoded GiB, per {epoch}. From the Walrus system object.</p>
					<p className="fine">
						Write fee{" "}
						<TokenAmount
							raw={prices.data.writePerUnit * MIB_PER_GIB}
							context="compact"
						/>{" "}
						WAL per GiB · gas about{" "}
						<TokenAmount raw={network.uploadGasMist} context="compact" /> SUI
						per upload
					</p>
				</>
			) : prices.status === "error" ? (
				<p className="problem" role="alert">
					Walrus prices are unavailable right now: {errorMessage(prices.error)}
				</p>
			) : (
				<>
					<Placeholder />
					<p>Reading prices from the Walrus system object…</p>
				</>
			)}
			{onTopUp ? (
				<div className="acts">
					<button className="btn sm" type="button" onClick={onTopUp}>
						Top up WAL
					</button>
				</div>
			) : null}
		</div>
	);
}

function daysParts(days: number): { value: string; unit: string } {
	if (days < 1) return { value: "< 1", unit: "day" };
	const [value = String(days), unit = "days"] = formatDays(days).split(" ");
	return { value, unit };
}

function count(value: number, noun: string): string {
	return `${value} ${value === 1 ? noun : `${noun}s`}`;
}
