import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useEffect, useRef, useState } from "react";
import type { BlobRecord } from "@/blobs/blob-record";
import { formatBytes } from "@/lib/format-bytes";
import { formatAgo } from "@/lib/format-date";
import {
	nodeStatusText,
	type Settled,
	type VerifyResult,
	verifyResult,
} from "@/manage/verify-result";
import type { NetworkClient } from "@/network/create-network-client";

/** Verify reads the whole blob into the tab; above this, the Walrus CLI is the tool. */
const MAX_VERIFY_BYTES = 200_000_000n;
/** How often the "checked … ago" line updates. */
const CLOCK_TICK_MS = 30_000;

/**
 * The last result per network client and blob id, kept while the tab is
 * open: the bytes behind an id never change.
 */
const results = new WeakMap<NetworkClient, Map<string, VerifyResult>>();

function resultsFor(client: NetworkClient): Map<string, VerifyResult> {
	let known = results.get(client);
	if (!known) {
		known = new Map();
		results.set(client, known);
	}
	return known;
}

type Reason = { kind: "ok" } | { kind: "off"; text: string };

function verifyReason(
	blob: Pick<BlobRecord, "certifiedEpoch" | "size">,
	expired: boolean,
): Reason {
	if (expired)
		return {
			kind: "off",
			text: "Its storage has ended, so nodes may have dropped its slivers. Verify works on live blobs.",
		};
	if (blob.certifiedEpoch === null)
		return {
			kind: "off",
			text: "Verify needs a certified blob: until certify, nodes have not confirmed they hold it.",
		};
	if (blob.size > MAX_VERIFY_BYTES)
		return {
			kind: "off",
			text: `Verify rebuilds the whole blob in this tab, which is limited to ${formatBytes(MAX_VERIFY_BYTES)}. Use walrus read with the Walrus CLI for larger blobs.`,
		};
	return { kind: "ok" };
}

/**
 * Verification on demand (PROTOCOL-NOTES section 8): the blob is rebuilt
 * from storage nodes' slivers in this browser and its blob id recomputed,
 * then a quorum of nodes is asked for its status. The result says when it
 * was checked; it never claims how many nodes answered, which the SDK does
 * not report.
 */
export function VerifySection({
	blob,
	expired,
	scope,
}: {
	blob: Pick<BlobRecord, "blobId" | "certifiedEpoch" | "size">;
	expired: boolean;
	/** Set for a file in a quilt: verify checks the quilt it is in. */
	scope: "blob" | "quilt-file";
}) {
	const client = useCurrentClient();
	const [result, setResult] = useState<VerifyResult | null>(
		() => resultsFor(client).get(blob.blobId) ?? null,
	);
	const [running, setRunning] = useState(false);
	const [nowMs, setNowMs] = useState(() => Date.now());
	const controller = useRef<AbortController | null>(null);
	const reason = verifyReason(blob, expired);

	useEffect(() => {
		const timer = setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
		return () => {
			clearInterval(timer);
			controller.current?.abort();
		};
	}, []);

	async function verify() {
		controller.current?.abort();
		const current = new AbortController();
		controller.current = current;
		setRunning(true);
		const [read, status] = await Promise.all([
			settle(
				client.walrus.readBlob({ blobId: blob.blobId, signal: current.signal }),
			),
			settle(
				client.walrus.getVerifiedBlobStatus({
					blobId: blob.blobId,
					signal: current.signal,
				}),
			),
		]);
		// A newer check, or closing the drawer, replaced this one.
		if (current.signal.aborted) return;
		const checked = verifyResult({
			read,
			status,
			expectedSize: blob.size,
			checkedAtMs: Date.now(),
		});
		resultsFor(client).set(blob.blobId, checked);
		setResult(checked);
		setNowMs(Date.now());
		setRunning(false);
	}

	return (
		<section
			className="sec"
			id="drawer-verify"
			aria-labelledby="drawer-verify-title"
		>
			<h4 id="drawer-verify-title">Verification</h4>
			{scope === "quilt-file" ? (
				<p className="note">
					A file is stored inside its quilt, so Verify checks the whole quilt.
				</p>
			) : null}
			<VerifyBox
				result={result}
				running={running}
				nowMs={nowMs}
				reason={reason}
			/>
			{reason.kind === "ok" ? (
				<div className="acts">
					<button
						className="btn btn-soft xs"
						type="button"
						disabled={running}
						aria-busy={running}
						onClick={verify}
					>
						{running ? "Verifying…" : result ? "Verify again" : "Verify"}
					</button>
				</div>
			) : null}
		</section>
	);
}

function VerifyBox({
	result,
	running,
	nowMs,
	reason,
}: {
	result: VerifyResult | null;
	running: boolean;
	nowMs: number;
	reason: Reason;
}) {
	if (reason.kind === "off")
		return (
			<p className="ver wait">
				<i aria-hidden="true" />
				{reason.text}
			</p>
		);
	if (running)
		return (
			<p className="ver wait" role="status">
				<i aria-hidden="true" />
				Rebuilding the blob from storage nodes and checking it against its blob
				id…
			</p>
		);
	if (result === null)
		return (
			<p className="ver wait">
				<i aria-hidden="true" />
				Not checked yet. Verify rebuilds this blob from storage nodes and checks
				the bytes against its blob id.
			</p>
		);
	const when = formatAgo(result.checkedAtMs, nowMs);
	if (result.kind === "match")
		return (
			<div className="ver" role="status">
				<i aria-hidden="true" />
				<span>
					Bytes match the blob id. Rebuilt from storage nodes {when}.
					<br />
					<small>
						{formatBytes(BigInt(result.bytes))} rebuilt and hashed in this
						browser. {nodeStatusText(result.nodeStatus)}
					</small>
				</span>
			</div>
		);
	const title =
		result.kind === "mismatch"
			? "The bytes do not match the blob id."
			: result.kind === "unavailable"
				? "Could not rebuild the blob."
				: "Verify failed.";
	return (
		<div className="ver warn" role="alert">
			<i aria-hidden="true" />
			<span>
				{title} Checked {when}.
				<br />
				<small>{result.detail}</small>
			</span>
		</div>
	);
}

async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
	try {
		return { ok: true, value: await promise };
	} catch (error) {
		return { ok: false, error };
	}
}
