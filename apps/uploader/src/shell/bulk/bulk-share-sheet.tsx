import { useMemo } from "react";
import { blobUrl, quiltPatchUrl } from "@/blobs/aggregator-urls";
import type { BlobRow } from "@/blobs/blob-row";
import type { EpochClock } from "@/blobs/epoch-clock";
import { readQuiltPatchList } from "@/blobs/quilt-patch-list";
import { errorMessage } from "@/lib/error-message";
import { useChainRead } from "@/lib/use-chain-read";
import { bulkEligibility } from "@/manage/bulk-eligibility";
import type { NetworkConfig } from "@/network/networks";
import { CopyField } from "../copy-field";
import { BulkSheet, LeftOutList } from "./bulk-sheet";

/** One link the sheet lists: what it serves, and the aggregator URL. */
interface BulkShareLink {
	label: string;
	url: string;
	encrypted: boolean;
}

/**
 * The aggregator links for the selected blobs (PROTOCOL-NOTES section 10):
 * a blob's content-addressed link, and for a quilt one link per file by its
 * patch id, read from the aggregator's patch list. Copy all puts every link
 * on the clipboard, one per line. An encrypted blob's link serves its
 * ciphertext; the list says so.
 */
export function BulkShareSheet({
	network,
	rows,
	clock,
	onClose,
}: {
	network: NetworkConfig;
	rows: readonly BlobRow[];
	clock: EpochClock;
	onClose: () => void;
}) {
	const { eligible, leftOut } = useMemo(
		() => bulkEligibility("share", rows, clock, network.maxEpochsAhead),
		[rows, clock, network.maxEpochsAhead],
	);
	const links = useChainRead(
		eligible.length === 0
			? null
			: `${network.id}:share:${eligible.map((row) => row.blob.objectId).join(",")}`,
		() => shareLinksFor(network.aggregatorUrl, eligible),
	).read;
	const all = links.status === "ready" ? links.data : [];

	return (
		<BulkSheet
			title="Share the selection"
			intro="Aggregator links for every selected blob that is certified and still stored. Any aggregator serves the same bytes; these use Mysten's. Anyone with a link can read a public blob."
			onClose={onClose}
			aside={
				<>
					<h4>Links</h4>
					{links.status === "loading" || links.status === "idle" ? (
						<p className="note" role="status">
							{eligible.length === 0
								? "None of the selected blobs has a link to share."
								: "Reading the quilts' file lists from the aggregator…"}
						</p>
					) : links.status === "error" ? (
						<p className="note warn" role="alert">
							Could not read a quilt's file list: {errorMessage(links.error)}
						</p>
					) : (
						<CopyField
							label={`All ${all.length === 1 ? "link" : `${all.length} links`}`}
							value={all.map((link) => link.url).join("\n")}
							multiline
						/>
					)}
					<p className="note">
						No Walrus Site links: a blob or quilt is not a site, and wal.app
						serves only Walrus Mainnet sites that have a SuiNS name.
					</p>
					<div className="acts">
						<button className="btn" type="button" onClick={onClose}>
							Close
						</button>
					</div>
				</>
			}
		>
			{all.length > 0 ? (
				<ul className="share-links" aria-label="Links">
					{all.map((link) => (
						<li key={link.url}>
							<span>
								{link.label}
								{link.encrypted ? (
									<small> · encrypted bytes, for its recipients</small>
								) : null}
							</span>
							<a href={link.url} target="_blank" rel="noopener noreferrer">
								{link.url}
							</a>
						</li>
					))}
				</ul>
			) : null}
			<LeftOutList leftOut={leftOut} maxEpochsAhead={network.maxEpochsAhead} />
		</BulkSheet>
	);
}

/** Each blob's link, and each quilt file's link, in selection order. */
async function shareLinksFor(
	aggregatorUrl: string,
	rows: readonly BlobRow[],
): Promise<BulkShareLink[]> {
	const perRow = await Promise.all(
		rows.map(async (row): Promise<BulkShareLink[]> => {
			if (!row.blob.isQuilt)
				return [
					{
						label: row.label,
						url: blobUrl(aggregatorUrl, row.blob.blobId),
						encrypted: row.blob.isEncrypted,
					},
				];
			const files = await readQuiltPatchList(aggregatorUrl, row.blob.blobId);
			return files.map((file) => ({
				label: `${row.label} / ${file.identifier}`,
				url: quiltPatchUrl(aggregatorUrl, file.patchId),
				encrypted: false,
			}));
		}),
	);
	return perRow.flat();
}
