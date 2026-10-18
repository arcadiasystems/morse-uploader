import {
	BlobNotCertifiedError,
	InconsistentBlobError,
	NoBlobMetadataReceivedError,
	NotEnoughSliversReceivedError,
	type WalrusClient,
} from "@mysten/walrus";
import { errorMessage } from "@/lib/error-message";

/** What one storage node reports about a blob; the SDK does not export the type. */
export type BlobStatus = Awaited<
	ReturnType<WalrusClient["getVerifiedBlobStatus"]>
>;

/**
 * Verify (PROTOCOL-NOTES section 8): `readBlob` gathers primary slivers from
 * the committee's storage nodes, decodes them and recomputes the blob id in
 * WASM, throwing `InconsistentBlobError` when it differs. The SDK does not
 * say how many nodes answered, so the result never claims a node count.
 * `getVerifiedBlobStatus` adds what a quorum of nodes reports about the blob.
 */

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** What a quorum of storage nodes reports, when they answered. */
export type NodeStatus =
	| { kind: "permanent"; endEpoch: number; certified: boolean }
	| { kind: "deletable"; certifiedEpoch: number | null }
	| { kind: "unknown" };

export type VerifyResult =
	| {
			kind: "match";
			checkedAtMs: number;
			bytes: number;
			nodeStatus: NodeStatus | null;
	  }
	| { kind: "mismatch"; checkedAtMs: number; detail: string }
	| { kind: "unavailable"; checkedAtMs: number; detail: string }
	| { kind: "failed"; checkedAtMs: number; detail: string };

export interface VerifyInput {
	read: Settled<Uint8Array>;
	status: Settled<BlobStatus>;
	/** The unencoded size the Blob object records on chain. */
	expectedSize: bigint;
	checkedAtMs: number;
}

export function verifyResult({
	read,
	status,
	expectedSize,
	checkedAtMs,
}: VerifyInput): VerifyResult {
	if (!read.ok) return readFailure(read.error, checkedAtMs);
	const bytes = read.value.length;
	if (BigInt(bytes) !== expectedSize)
		return {
			kind: "mismatch",
			checkedAtMs,
			detail: `The nodes' slivers rebuilt ${bytes} bytes, but the blob's record on Sui says ${expectedSize}.`,
		};
	return {
		kind: "match",
		checkedAtMs,
		bytes,
		nodeStatus: status.ok ? nodeStatus(status.value) : null,
	};
}

function readFailure(error: unknown, checkedAtMs: number): VerifyResult {
	if (error instanceof InconsistentBlobError)
		return {
			kind: "mismatch",
			checkedAtMs,
			detail:
				"The bytes rebuilt from storage nodes do not hash to this blob id.",
		};
	if (
		error instanceof NoBlobMetadataReceivedError ||
		error instanceof NotEnoughSliversReceivedError ||
		error instanceof BlobNotCertifiedError
	)
		return {
			kind: "unavailable",
			checkedAtMs,
			detail:
				"Storage nodes did not return enough of this blob to rebuild it. Try again in a minute; if it keeps failing, its slivers may be gone.",
		};
	return { kind: "failed", checkedAtMs, detail: errorMessage(error) };
}

function nodeStatus(status: BlobStatus): NodeStatus {
	switch (status.type) {
		case "permanent":
			return {
				kind: "permanent",
				endEpoch: status.endEpoch,
				certified: status.isCertified,
			};
		case "deletable":
			return {
				kind: "deletable",
				certifiedEpoch: status.initialCertifiedEpoch,
			};
		case "nonexistent":
		case "invalid":
			return { kind: "unknown" };
	}
}

/** The line under a match: what the nodes report, in plain words. */
export function nodeStatusText(status: NodeStatus | null): string {
	if (status === null)
		return "The nodes' status report did not reach a quorum this time.";
	switch (status.kind) {
		case "permanent":
			return status.certified
				? `A quorum of nodes reports it certified and stored until epoch ${status.endEpoch}.`
				: `A quorum of nodes reports it stored until epoch ${status.endEpoch}, not yet certified.`;
		case "deletable":
			return status.certifiedEpoch === null
				? "A quorum of nodes reports it as a deletable blob."
				: `A quorum of nodes reports it as a deletable blob, certified in epoch ${status.certifiedEpoch}.`;
		case "unknown":
			return "The nodes' status report was inconclusive.";
	}
}
