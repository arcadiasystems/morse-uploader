import { useState } from "react";
import type { BlobRecord } from "@/blobs/blob-record";
import type { BlobStatus } from "@/blobs/blob-status";
import type { EpochClock } from "@/blobs/epoch-clock";
import { TokenAmount } from "@/components/token-amount";
import type { Balances } from "@/funds/types";
import { formatDays, formatShortDate } from "@/lib/format-date";
import type { ChainRead } from "@/lib/use-chain-read";
import {
	extendBlocker,
	extendBlockerText,
	extendFrost,
} from "@/manage/extend-rules";
import type { AutoExtend } from "@/manage/use-auto-extend";
import type { NetworkConfig } from "@/network/networks";
import type { WalletActions } from "@/wallet/use-wallet-actions";
import { AutoExtendPanel } from "./auto-extend-panel";
import { ExtendPanel } from "./extend-panel";

/**
 * Paid storage, as the design's inspector draws it: how far it reaches,
 * then Extend and Auto-extend. Extend opens the extend panel (epochs within
 * the 53-epoch limit, the live cost and the balances after); Auto-extend
 * opens the profile's setting. A file in a quilt shares its quilt's storage.
 */
export function StorageSection({
	network,
	blob,
	status,
	clock,
	nowMs,
	actions,
	balances,
	storagePricePerUnit,
	autoExtend,
	scope,
	extendOpen,
	onToggleExtend,
	onExtended,
}: {
	network: NetworkConfig;
	blob: BlobRecord;
	status: BlobStatus;
	clock: EpochClock;
	nowMs: number;
	actions: WalletActions | null;
	balances: ChainRead<Balances>;
	/** The storage price from the system object, for the button's 1-epoch cost. */
	storagePricePerUnit: bigint | null;
	autoExtend: AutoExtend | null;
	scope: "blob" | "quilt-file";
	extendOpen: boolean;
	onToggleExtend: () => void;
	onExtended: () => void;
}) {
	const [autoOpen, setAutoOpen] = useState(false);
	const blocker = extendBlocker(blob, clock, network.maxEpochsAhead);
	const expired = status.kind === "expired";
	const warn = status.kind === "expiring";
	const oneEpoch =
		storagePricePerUnit === null
			? null
			: extendFrost(blob.encodedSize, 1, storagePricePerUnit);
	return (
		<section
			className="sec"
			id="insp-storage"
			aria-labelledby="insp-storage-title"
		>
			<h4 id="insp-storage-title">Storage</h4>
			<div className="lifebig">
				<div className={warn ? "bar warn" : "bar"} aria-hidden="true">
					<i style={{ width: `${(status.remaining * 100).toFixed(1)}%` }} />
				</div>
				{expired ? (
					<div className="row">
						<span>
							Storage ended at epoch {blob.endEpoch}, about{" "}
							{formatShortDate(status.expiresAtMs, nowMs)}.
						</span>
					</div>
				) : (
					<div className="row">
						<span>Paid until epoch {blob.endEpoch} starts</span>
						<span>
							<b>{formatDays(status.daysLeft)}</b> left
						</span>
					</div>
				)}
				{expired ? null : (
					<small className="hint">
						Until about {formatShortDate(status.expiresAtMs, nowMs)}. Dates are
						estimates from epoch timing.
					</small>
				)}
			</div>
			{scope === "quilt-file" ? (
				<p className="note">
					This file is stored in its quilt: extending extends every file in the
					quilt.
				</p>
			) : null}
			<div className="acts">
				{blocker === null && actions ? (
					<button
						className="btn sm"
						type="button"
						aria-expanded={extendOpen}
						aria-controls="insp-extend"
						onClick={onToggleExtend}
					>
						{oneEpoch === null ? (
							"Extend"
						) : (
							<>
								+1 epoch · <TokenAmount raw={oneEpoch} context="compact" /> WAL
							</>
						)}
					</button>
				) : null}
				{autoExtend ? (
					<button
						className={autoExtend.settings.enabled ? "btn sm on" : "btn sm"}
						type="button"
						aria-expanded={autoOpen}
						aria-controls="insp-auto-extend"
						onClick={() => setAutoOpen((open) => !open)}
					>
						{autoExtend.settings.enabled ? "Auto-extend · on" : "Auto-extend"}
					</button>
				) : null}
			</div>
			{blocker ? <p className="note">{extendBlockerText(blocker)}</p> : null}
			{blocker === null && actions && extendOpen ? (
				<div id="insp-extend">
					<ExtendPanel
						network={network}
						blob={blob}
						clock={clock}
						nowMs={nowMs}
						actions={actions}
						balances={balances}
						onExtended={onExtended}
					/>
				</div>
			) : null}
			{autoExtend && autoOpen ? (
				<div id="insp-auto-extend">
					<AutoExtendPanel
						network={network}
						autoExtend={autoExtend}
						covers={
							blocker === null || blocker.kind === "at-limit"
								? "this-blob"
								: "not-this-blob"
						}
					/>
				</div>
			) : null}
		</section>
	);
}
