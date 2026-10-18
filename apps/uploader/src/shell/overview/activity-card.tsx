import { normalizeSuiAddress } from "@mysten/sui/utils";
import type { ReactNode } from "react";
import type { ActivityItem, ActivityKind } from "@/activity/activity";
import type { ListedBlobs } from "@/blobs/list-blobs";
import { errorMessage } from "@/lib/error-message";
import { formatWhen } from "@/lib/format-date";
import { shortenAddress } from "@/lib/shorten-address";
import type { ChainRead } from "@/lib/use-chain-read";
import type { MorseReads } from "@/morse/use-morse-reads";
import { explorerTxUrl } from "@/network/explorer-urls";
import type { NetworkConfig } from "@/network/networks";

/** The tag each kind of action wears, in the status colours. */
const TAGS: Readonly<Record<ActivityKind, { label: string; tone: string }>> = {
	register: { label: "registered", tone: "violet" },
	certify: { label: "certified", tone: "cyan" },
	extend: { label: "extended", tone: "cyan" },
	delete: { label: "deleted", tone: "dim" },
	burn: { label: "burned", tone: "dim" },
	publish: { label: "recorded", tone: "green" },
	encrypt: { label: "encrypted", tone: "violet" },
	share: { label: "shared", tone: "" },
	unshare: { label: "unshared", tone: "dim" },
};

/**
 * The wallet's recent Walrus and Morse transactions, read from Sui GraphQL.
 * Each row links to its transaction on the explorer.
 */
export function ActivityCard({
	network,
	activity,
	listed,
	morse,
	onRetry,
}: {
	network: NetworkConfig;
	activity: ChainRead<ActivityItem[]>;
	listed: ListedBlobs | null;
	morse: MorseReads;
	onRetry: () => void;
}) {
	let body: ReactNode;
	if (activity.status === "error") {
		body = (
			<>
				<p className="problem" role="alert">
					Could not read recent transactions: {errorMessage(activity.error)}
				</p>
				<div className="acts">
					<button className="btn sm" type="button" onClick={onRetry}>
						Try again
					</button>
				</div>
			</>
		);
	} else if (activity.status !== "ready") {
		body = <div className="act skel" aria-busy="true" />;
	} else if (activity.data.length === 0) {
		body = (
			<p>
				No Walrus or Morse transactions among the last 25 this wallet sent on{" "}
				{network.label}.
			</p>
		);
	} else {
		const names = new Names(listed, morse);
		const nowMs = activity.readAt.getTime();
		body = (
			<ul className="act">
				{activity.data.map((item) => {
					const tag = item.succeeded
						? TAGS[item.kind]
						: { label: "failed", tone: "red" };
					return (
						<li key={item.digest} data-activity={item.kind}>
							<a
								className="t"
								href={explorerTxUrl(network, item.digest)}
								target="_blank"
								rel="noopener noreferrer"
								title="View the transaction"
							>
								{formatWhen(item.timestampMs, nowMs)}
							</a>
							<span className="w">{describe(item, names)}</span>
							<span className={`tag ${tag.tone}`}>
								{item.succeeded ? <i aria-hidden="true" /> : null}
								{tag.label}
							</span>
						</li>
					);
				})}
			</ul>
		);
	}
	return (
		<div className="card span-7">
			<h4>Recent activity</h4>
			{body}
		</div>
	);
}

/** Names for what an action touched: blobs from the list, publications and files from Morse. */
class Names {
	private readonly blobs = new Map<string, string>();
	private readonly publications = new Map<string, string>();
	private readonly files = new Map<string, string>();

	constructor(listed: ListedBlobs | null, morse: MorseReads) {
		for (const row of listed?.rows ?? [])
			this.blobs.set(normalizeSuiAddress(row.blob.objectId), row.label);
		if (
			morse.publications.status === "ready" &&
			morse.publications.data.kind === "complete"
		)
			for (const publication of morse.publications.data.publications)
				this.publications.set(
					normalizeSuiAddress(publication.id),
					publication.name,
				);
		if (
			morse.shared.status === "ready" &&
			morse.shared.data.kind === "complete"
		)
			for (const file of morse.shared.data.files)
				this.files.set(normalizeSuiAddress(file.fileId), file.name);
	}

	blob(objectId: string): string {
		return (
			this.blobs.get(normalizeSuiAddress(objectId)) ?? shortenAddress(objectId)
		);
	}

	publication(objectId: string | undefined): string {
		if (objectId === undefined) return "a Morse publication";
		return (
			this.publications.get(normalizeSuiAddress(objectId)) ??
			shortenAddress(objectId)
		);
	}

	file(file: ActivityItem["file"]): string {
		if (file === null) return "an encrypted file";
		return (
			file.name ??
			this.files.get(normalizeSuiAddress(file.id)) ??
			"an encrypted file"
		);
	}
}

function describe(item: ActivityItem, names: Names): ReactNode {
	const [first, ...others] = item.blobObjectIds;
	const blobs = (
		<b>
			{first === undefined ? "a blob" : names.blob(first)}
			{others.length > 0 ? ` and ${others.length} more` : ""}
		</b>
	);
	const recipient = item.recipient
		? shortenAddress(item.recipient)
		: "a wallet";
	switch (item.kind) {
		case "register":
			return <>{blobs} registered on Walrus</>;
		case "certify":
			return <>{blobs} certified</>;
		case "extend":
			return <>{blobs} storage extended</>;
		case "delete":
			return <>{blobs} deleted, its storage returned to the wallet</>;
		case "burn":
			return <>{blobs} record burned</>;
		case "publish":
			return (
				<>
					{blobs} added to <b>{names.publication(item.publicationIds[0])}</b>
				</>
			);
		case "encrypt":
			return (
				<>
					<b>{names.file(item.file)}</b> encrypted with Seal, access policy
					recorded
				</>
			);
		case "share":
			return (
				<>
					<b>{names.file(item.file)}</b> shared with {recipient}
				</>
			);
		case "unshare":
			return (
				<>
					<b>{names.file(item.file)}</b> no longer shared with {recipient}
				</>
			);
	}
}
