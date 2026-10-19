import { useMemo } from "react";
import type { BlobRow } from "@/blobs/blob-row";
import type { EpochClock } from "@/blobs/epoch-clock";
import { Icon } from "@/components/icon";
import { TokenAmount } from "@/components/token-amount";
import { planBulkExtend } from "@/manage/bulk-extend";
import type { NetworkConfig } from "@/network/networks";

/** The bulk actions, each of which opens its sheet. */
export type BulkSheetKind =
	| "extend"
	| "share"
	| "verify"
	| "publish"
	| "delete";

/**
 * The bulk bar (design/v2/app-bulk.html): it rises when rows are selected,
 * with how many, Extend all with its cost for one epoch at the price read
 * from the system object, Share, Verify, Publish and Delete. Each opens a
 * sheet that names what it leaves out and why. Selected blobs the current
 * filter hides still count, and the bar says how many.
 */
export function BulkBar({
	network,
	rows,
	hidden,
	clock,
	storagePricePerUnit,
	canSign,
	onOpen,
	onClear,
}: {
	network: NetworkConfig;
	/** Every selected blob, shown or not. */
	rows: readonly BlobRow[];
	/** Selected blobs the current filter or search hides. */
	hidden: number;
	clock: EpochClock;
	storagePricePerUnit: bigint | null;
	/** A wallet is connected, so the actions that sign are open. */
	canSign: boolean;
	onOpen: (sheet: BulkSheetKind) => void;
	onClear: () => void;
}) {
	const oneEpoch = useMemo(
		() =>
			storagePricePerUnit === null
				? null
				: planBulkExtend({
						rows,
						epochs: 1,
						clock,
						maxEpochsAhead: network.maxEpochsAhead,
						pricePerUnit: storagePricePerUnit,
						capFrost: null,
					}).totalFrost,
		[rows, clock, network.maxEpochsAhead, storagePricePerUnit],
	);
	return (
		<div className="bulk" role="toolbar" aria-label="Selected blobs">
			<b aria-live="polite">
				{rows.length} selected
				{hidden > 0 ? <small> · {hidden} not in this view</small> : null}
			</b>
			<button
				className="btn sm primary"
				type="button"
				disabled={!canSign}
				onClick={() => onOpen("extend")}
			>
				Extend all
				{oneEpoch === null ? null : (
					<>
						{" "}
						· <TokenAmount raw={oneEpoch} context="compact" /> WAL
					</>
				)}
			</button>
			<button className="btn sm" type="button" onClick={() => onOpen("share")}>
				Share
			</button>
			<button className="btn sm" type="button" onClick={() => onOpen("verify")}>
				Verify
			</button>
			<button
				className="btn sm"
				type="button"
				disabled={!canSign}
				onClick={() => onOpen("publish")}
			>
				Publish
			</button>
			<button
				className="btn sm danger"
				type="button"
				disabled={!canSign}
				onClick={() => onOpen("delete")}
			>
				Delete
			</button>
			<button
				className="x"
				type="button"
				aria-label="Clear the selection"
				onClick={onClear}
			>
				<Icon name="close" size={14} />
			</button>
		</div>
	);
}
