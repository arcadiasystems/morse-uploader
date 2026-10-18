import { EXPIRING_SOON_DAYS } from "@/blobs/blob-status";
import type { BlobSummary } from "@/blobs/summarize-rows";
import { formatBytes } from "@/lib/format-bytes";
import { shortenAddress } from "@/lib/shorten-address";
import type { ListItem } from "./list-items";

/** Totals for the wallet's blobs, and the selected row's on-chain record. */
export function BlobFooter({
	summary,
	selected,
}: {
	summary: BlobSummary;
	selected: ListItem | null;
}) {
	const { counts, totalSize } = summary;
	return (
		<div className="ft">
			<span>
				<b>{counts.all}</b> {counts.all === 1 ? "blob" : "blobs"}
			</span>
			<span>
				<b>{counts.quilts}</b> {counts.quilts === 1 ? "quilt" : "quilts"}
			</span>
			<span>
				<b>{formatBytes(totalSize)}</b>
			</span>
			<span className="sp" />
			<span className="info">
				{selected ? (
					<SelectionRecord item={selected} />
				) : (
					`${counts.expiring} expiring within ${EXPIRING_SOON_DAYS} days`
				)}
			</span>
		</div>
	);
}

function SelectionRecord({ item }: { item: ListItem }) {
	if (item.kind === "patch") {
		return (
			<>
				patch {item.position} of {item.setSize} in {item.quilt.label}
			</>
		);
	}
	if (item.kind !== "blob") return <>{item.quilt.label}</>;
	const { objectId, deletable, certifiedEpoch, endEpoch } = item.row.blob;
	const permanence = deletable ? "deletable" : "permanent";
	const brief = [
		shortenAddress(objectId),
		permanence,
		certifiedEpoch === null ? "not certified" : `certified ${certifiedEpoch}`,
		`ends ${endEpoch}`,
	].join(" · ");
	const full = `Object ${objectId}, ${permanence}, ${
		certifiedEpoch === null
			? "never certified"
			: `certified in epoch ${certifiedEpoch}`
	}, storage ends at epoch ${endEpoch}`;
	return <span title={full}>{brief}</span>;
}
