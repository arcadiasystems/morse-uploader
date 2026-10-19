import type { ShareLink } from "@/manage/share";
import type { NetworkConfig } from "@/network/networks";
import { CopyField } from "../copy-field";

/**
 * Share (PROTOCOL-NOTES section 10): aggregator links and an embed snippet.
 * A blob or quilt is not a Walrus Site, so there is no site link, and the
 * section says why instead of showing a dead button.
 */
export function ShareSection({
	network,
	links,
	embed,
	encrypted,
	quilt,
}: {
	network: NetworkConfig;
	links: readonly ShareLink[];
	embed: string | null;
	encrypted: boolean;
	/** A whole quilt: each file has its own address, listed under Files. */
	quilt: boolean;
}) {
	const [first] = links;
	return (
		<section className="sec" id="insp-share" aria-labelledby="insp-share-title">
			<h4 id="insp-share-title">Share</h4>
			{quilt ? (
				<p className="note">
					A quilt is shared file by file: each file's address is under Files
					above. Select a file in the list for its patch link and embed.
				</p>
			) : null}
			{links.map((link) => (
				<CopyField key={link.url} label={link.label} value={link.url} />
			))}
			{embed ? <CopyField label="Embed" value={embed} multiline /> : null}
			{first ? (
				<div className="acts">
					<a
						className="btn sm"
						href={first.url}
						target="_blank"
						rel="noopener noreferrer"
					>
						Open in aggregator
					</a>
				</div>
			) : null}
			<small className="hint">
				{encrypted
					? "The link serves the encrypted bytes. Only wallets on its RecipientFile can decrypt them."
					: "Anyone with the blob id can read a public blob. Encrypt before upload for anything private."}{" "}
				The links use Mysten's {network.walrusLabel} aggregator; any aggregator
				serves the same bytes.
			</small>
			<small className="hint">
				No Walrus Site link: a blob or quilt is not a site. Site links exist
				only for Walrus Sites objects, and wal.app serves only Walrus Mainnet
				sites that have a SuiNS name.
			</small>
		</section>
	);
}
