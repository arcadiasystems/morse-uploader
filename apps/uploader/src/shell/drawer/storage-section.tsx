import type { BlobRecord } from "@/blobs/blob-record";
import type { BlobStatus } from "@/blobs/blob-status";
import type { EpochClock } from "@/blobs/epoch-clock";
import type { Balances } from "@/funds/types";
import { formatDays, formatShortDate } from "@/lib/format-date";
import type { ChainRead } from "@/lib/use-chain-read";
import { extendBlocker, extendBlockerText } from "@/manage/extend-rules";
import type { AutoExtend } from "@/manage/use-auto-extend";
import type { NetworkConfig } from "@/network/networks";
import type { WalletActions } from "@/wallet/use-wallet-actions";
import { AutoExtendPanel } from "./auto-extend-panel";
import { ExtendPanel } from "./extend-panel";

/**
 * Paid storage: how far it reaches, Extend within the 53-epoch limit, and
 * the profile's auto-extend. A file in a quilt shares its quilt's storage.
 */
export function StorageSection({
	network,
	blob,
	status,
	clock,
	nowMs,
	actions,
	balances,
	autoExtend,
	scope,
	onExtended,
}: {
	network: NetworkConfig;
	blob: BlobRecord;
	status: BlobStatus;
	clock: EpochClock;
	nowMs: number;
	actions: WalletActions | null;
	balances: ChainRead<Balances>;
	autoExtend: AutoExtend | null;
	scope: "blob" | "quilt-file";
	onExtended: () => void;
}) {
	const blocker = extendBlocker(blob, clock, network.maxEpochsAhead);
	const expired = status.kind === "expired";
	const warn = status.kind === "expiring";
	return (
		<section
			className="sec"
			id="drawer-storage"
			aria-labelledby="drawer-storage-title"
		>
			<h4 id="drawer-storage-title">Storage</h4>
			<div className="exp">
				<div className={warn ? "bar warn" : "bar"} aria-hidden="true">
					<i style={{ width: `${(status.remaining * 100).toFixed(1)}%` }} />
				</div>
				<small>
					{expired ? (
						<>
							Storage ended at epoch {blob.endEpoch}, about{" "}
							{formatShortDate(status.expiresAtMs, nowMs)}.
						</>
					) : (
						<>
							Paid until epoch {blob.endEpoch} starts · about{" "}
							<b>{formatDays(status.daysLeft)}</b> left, until about{" "}
							{formatShortDate(status.expiresAtMs, nowMs)}.
						</>
					)}
				</small>
			</div>
			{scope === "quilt-file" ? (
				<p className="note">
					This file is stored in its quilt: extending extends every file in the
					quilt.
				</p>
			) : null}
			{blocker ? (
				<p className="note">{extendBlockerText(blocker)}</p>
			) : actions ? (
				<ExtendPanel
					network={network}
					blob={blob}
					clock={clock}
					nowMs={nowMs}
					actions={actions}
					balances={balances}
					onExtended={onExtended}
				/>
			) : null}
			{autoExtend ? (
				<AutoExtendPanel
					network={network}
					autoExtend={autoExtend}
					covers={blocker === null || blocker.kind === "at-limit"}
				/>
			) : null}
		</section>
	);
}
