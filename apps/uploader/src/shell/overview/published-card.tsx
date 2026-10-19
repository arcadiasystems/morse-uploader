import type { ReactNode } from "react";
import type { ListedBlobs } from "@/blobs/list-blobs";
import { publishedObjectIds } from "@/blobs/morse-marks";
import { errorMessage } from "@/lib/error-message";
import type { ChainRead } from "@/lib/use-chain-read";
import type { Publications } from "@/morse/read-publications";
import { explorerObjectUrl } from "@/network/explorer-urls";
import type { NetworkConfig } from "@/network/networks";

/** Publications listed before the rest are summed up. */
const SHOWN = 4;

/**
 * What the wallet publishes through Morse: the publications it owns or
 * writes to, their public entries, and how many of its own blobs those
 * entries point at. Read through morse-sdk.
 */
export function PublishedCard({
	network,
	publications,
	listed,
	onRetry,
	onShowPublished,
}: {
	network: NetworkConfig;
	publications: ChainRead<Publications>;
	listed: ListedBlobs | null;
	onRetry: () => void;
	onShowPublished: () => void;
}) {
	let body: ReactNode;
	if (publications.status === "error") {
		body = (
			<>
				<p className="problem" role="alert">
					Could not read your Morse publications:{" "}
					{errorMessage(publications.error)}
				</p>
				<div className="acts">
					<button className="btn sm" type="button" onClick={onRetry}>
						Try again
					</button>
				</div>
			</>
		);
	} else if (publications.status !== "ready") {
		body = <div className="act skel" aria-busy="true" />;
	} else if (publications.data.kind === "unavailable") {
		body = <p>{publications.data.reason}</p>;
	} else if (publications.data.publications.length === 0) {
		body = (
			<p>
				This wallet owns or writes to no Morse publication on {network.label}.
				Publish a blob from its details to add it to one you hold a PublisherCap
				for.
			</p>
		);
	} else {
		const all = publications.data.publications;
		const rows = listed?.rows ?? [];
		body = (
			<>
				<ul className="act">
					{all.slice(0, SHOWN).map((publication) => {
						const mine = publishedObjectIds(rows, publication.refs).size;
						return (
							<li key={publication.id} data-publication={publication.id}>
								<a
									className="t"
									href={explorerObjectUrl(network, publication.id)}
									target="_blank"
									rel="noopener noreferrer"
									title="View the publication"
								>
									pub
								</a>
								<span className="w">
									<b>{publication.name}</b> ·{" "}
									{plural(
										publication.publicEntries,
										"public entry",
										"public entries",
									)}
									{listed ? ` · ${mine} of your blobs` : ""}
								</span>
								<span
									className={
										publication.role === "owner" ? "tag lift" : "tag green"
									}
								>
									{publication.role}
								</span>
							</li>
						);
					})}
				</ul>
				{all.length > SHOWN ? (
					<p className="fine">
						And{" "}
						{plural(
							all.length - SHOWN,
							"more publication",
							"more publications",
						)}
						.
					</p>
				) : null}
			</>
		);
	}
	return (
		<div className="card span-5">
			<h4>Published through Morse</h4>
			{body}
			<span className="sp" />
			<div className="acts">
				<button className="btn sm" type="button" onClick={onShowPublished}>
					Show published files
				</button>
			</div>
		</div>
	);
}

function plural(value: number, one: string, many: string): string {
	return `${value} ${value === 1 ? one : many}`;
}
