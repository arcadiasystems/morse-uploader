import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BlobRecord } from "@/blobs/blob-record";
import { formatBytes } from "@/lib/format-bytes";
import { formatAgo } from "@/lib/format-date";
import { knownVerifyResult, verifyBlob } from "@/manage/verify-blob";
import { nodeStatusText, type VerifyResult } from "@/manage/verify-result";
import {
	type VerifyBlocker,
	verifyBlocker,
	verifyBlockerText,
} from "@/manage/verify-rules";

/** How often the "checked … ago" line updates. */
const CLOCK_TICK_MS = 30_000;

/**
 * Verification on demand (PROTOCOL-NOTES section 8): the blob is rebuilt
 * from storage nodes' slivers in this browser and its blob id recomputed,
 * then a quorum of nodes is asked for its status. The result says when it
 * was checked; it never claims how many nodes answered, which the SDK does
 * not report. The inspector's Verify action runs it through `runRequest`.
 */
export function VerifySection({
	blob,
	expired,
	scope,
	runRequest,
}: {
	blob: Pick<BlobRecord, "blobId" | "certifiedEpoch" | "size">;
	expired: boolean;
	/** Set for a file in a quilt: verify checks the quilt it is in. */
	scope: "blob" | "quilt-file";
	/** Changes each time the action row asks for a check; 0 asks for none. */
	runRequest: number;
}) {
	const client = useCurrentClient();
	const [result, setResult] = useState<VerifyResult | null>(() =>
		knownVerifyResult(client, blob.blobId),
	);
	const [running, setRunning] = useState(false);
	const [nowMs, setNowMs] = useState(() => Date.now());
	const controller = useRef<AbortController | null>(null);
	const blocker = verifyBlocker(blob, expired);

	useEffect(() => {
		const timer = setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
		return () => {
			clearInterval(timer);
			controller.current?.abort();
		};
	}, []);

	const verify = useCallback(async () => {
		controller.current?.abort();
		const current = new AbortController();
		controller.current = current;
		setRunning(true);
		const checked = await verifyBlob(client, blob, current.signal);
		// A newer check, or closing the inspector, replaced this one.
		if (checked === null) return;
		setResult(checked);
		setNowMs(Date.now());
		setRunning(false);
	}, [client, blob]);

	// Only a new request runs a check, not a re-render with a new blob copy.
	const handled = useRef(0);
	const blocked = blocker !== null;
	useEffect(() => {
		if (runRequest === handled.current) return;
		handled.current = runRequest;
		if (!blocked) void verify();
	}, [runRequest, blocked, verify]);

	return (
		<section
			className="sec"
			id="insp-verify"
			aria-labelledby="insp-verify-title"
		>
			<h4 id="insp-verify-title">Verification</h4>
			{scope === "quilt-file" ? (
				<p className="note">
					A file is stored inside its quilt, so Verify checks the whole quilt.
				</p>
			) : null}
			<VerifyBox
				result={result}
				running={running}
				nowMs={nowMs}
				blocker={blocker}
			/>
			{blocker === null && (result !== null || running) ? (
				<div className="acts">
					<button
						className="btn sm"
						type="button"
						disabled={running}
						aria-busy={running}
						onClick={verify}
					>
						{running ? "Verifying…" : "Verify again"}
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
	blocker,
}: {
	result: VerifyResult | null;
	running: boolean;
	nowMs: number;
	blocker: VerifyBlocker | null;
}) {
	if (blocker !== null)
		return (
			<p className="ver wait">
				<i aria-hidden="true" />
				{verifyBlockerText(blocker)}
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
