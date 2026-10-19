import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BlobRow } from "@/blobs/blob-row";
import type { EpochClock } from "@/blobs/epoch-clock";
import { createLimiter } from "@/lib/create-limiter";
import { bulkEligibility } from "@/manage/bulk-eligibility";
import { knownVerifyResult, verifyBlob } from "@/manage/verify-blob";
import type { VerifyResult } from "@/manage/verify-result";
import type { NetworkConfig } from "@/network/networks";
import { BulkSheet, LeftOutList } from "./bulk-sheet";

/** Checks running at once; each fans out to the committee's storage nodes. */
const CHECKS_AT_ONCE = 2;

type Check = { kind: "waiting" } | { kind: "running" } | VerifyResult;

const RESULT_TEXT: Readonly<Record<VerifyResult["kind"], string>> = {
	match: "Bytes match the blob id",
	mismatch: "The bytes do not match the blob id",
	unavailable: "Could not rebuild it",
	failed: "Verify failed",
};

/**
 * Verify for the selection (PROTOCOL-NOTES section 8): each blob is rebuilt
 * from storage nodes' slivers in this browser and its blob id recomputed,
 * two at a time, and the results are summed up. Like the inspector's
 * Verify, it never claims how many nodes answered.
 */
export function BulkVerifySheet({
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
	const client = useCurrentClient();
	const { eligible, leftOut } = useMemo(
		() => bulkEligibility("verify", rows, clock, network.maxEpochsAhead),
		[rows, clock, network.maxEpochsAhead],
	);
	const [checks, setChecks] = useState<ReadonlyMap<string, Check>>(
		() =>
			new Map(
				eligible.flatMap((row) => {
					const known = knownVerifyResult(client, row.blob.blobId);
					return known ? [[row.blob.objectId, known] as const] : [];
				}),
			),
	);
	const controller = useRef<AbortController | null>(null);
	useEffect(() => () => controller.current?.abort(), []);

	const running = [...checks.values()].some(
		(check) => check.kind === "waiting" || check.kind === "running",
	);
	const results = eligible.flatMap((row) => {
		const check = checks.get(row.blob.objectId);
		return check && check.kind !== "waiting" && check.kind !== "running"
			? [check]
			: [];
	});
	const matched = results.filter((result) => result.kind === "match").length;

	async function verifyAll() {
		controller.current?.abort();
		const current = new AbortController();
		controller.current = current;
		const set = (objectId: string, check: Check) =>
			setChecks((previous) => new Map(previous).set(objectId, check));
		setChecks(
			new Map(
				eligible.map(
					(row) => [row.blob.objectId, { kind: "waiting" }] as const,
				),
			),
		);
		const limit = createLimiter(CHECKS_AT_ONCE);
		await Promise.all(
			eligible.map((row) =>
				limit(async () => {
					if (current.signal.aborted) return;
					set(row.blob.objectId, { kind: "running" });
					const result = await verifyBlob(client, row.blob, current.signal);
					if (result) set(row.blob.objectId, result);
				}),
			),
		);
	}

	return (
		<BulkSheet
			title="Verify the selection"
			intro="Each blob is rebuilt from storage nodes' slivers in this browser and checked against its blob id. Nothing is signed or paid."
			onClose={onClose}
			aside={
				<>
					<h4>Result</h4>
					<p className="note" role="status" aria-live="polite">
						{eligible.length === 0
							? "None of the selected blobs can be verified."
							: running
								? `Checked ${results.length} of ${eligible.length}…`
								: results.length === 0
									? `${eligible.length === 1 ? "1 blob" : `${eligible.length} blobs`} to check.`
									: `Bytes match the blob id for ${matched} of ${results.length === 1 ? "1 blob" : `${results.length} blobs`}.${results.length > matched ? ` ${results.length - matched} did not; see the list.` : ""}`}
					</p>
					<div className="acts">
						<button
							className="btn primary"
							type="button"
							disabled={eligible.length === 0 || running}
							aria-busy={running}
							onClick={verifyAll}
						>
							{running
								? "Verifying…"
								: results.length > 0
									? "Verify again"
									: `Verify ${eligible.length === 1 ? "1 blob" : `${eligible.length} blobs`}`}
						</button>
						<button className="btn" type="button" onClick={onClose}>
							Close
						</button>
					</div>
				</>
			}
		>
			{eligible.length > 0 ? (
				<ul className="checks" aria-label="Blobs to verify">
					{eligible.map((row) => (
						<CheckRow
							key={row.blob.objectId}
							row={row}
							check={checks.get(row.blob.objectId) ?? null}
						/>
					))}
				</ul>
			) : null}
			<LeftOutList leftOut={leftOut} maxEpochsAhead={network.maxEpochsAhead} />
		</BulkSheet>
	);
}

function CheckRow({ row, check }: { row: BlobRow; check: Check | null }) {
	const state =
		check === null
			? { tone: "wait", text: "Not checked" }
			: check.kind === "waiting"
				? { tone: "wait", text: "Waiting" }
				: check.kind === "running"
					? { tone: "wait", text: "Rebuilding from storage nodes…" }
					: {
							tone: check.kind === "match" ? "ok" : "warn",
							text: RESULT_TEXT[check.kind],
						};
	return (
		<li className={`check ${state.tone}`}>
			<i aria-hidden="true" />
			<span className="nm">{row.label}</span>
			<span className="st">
				{state.text}
				{check !== null && "detail" in check ? (
					<small>{check.detail}</small>
				) : null}
			</span>
		</li>
	);
}
