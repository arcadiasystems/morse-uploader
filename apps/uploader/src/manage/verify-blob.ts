import type { BlobRecord } from "@/blobs/blob-record";
import type { NetworkClient } from "@/network/create-network-client";
import { type Settled, type VerifyResult, verifyResult } from "./verify-result";

/**
 * The last result per network client and blob id, kept while the tab is
 * open: the bytes behind an id never change. The inspector and the bulk
 * bar share it, so a blob checked in one shows as checked in the other.
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

/** The last verify result for this blob id on this network, if one ran in this tab. */
export function knownVerifyResult(
	client: NetworkClient,
	blobId: string,
): VerifyResult | null {
	return resultsFor(client).get(blobId) ?? null;
}

/**
 * Verify (PROTOCOL-NOTES section 8): rebuilds the blob from storage nodes'
 * slivers in this browser, which recomputes its blob id, and asks a quorum
 * of nodes for its status. The result is remembered for the tab.
 * @returns `null` when `signal` aborted the check before it finished.
 */
export async function verifyBlob(
	client: NetworkClient,
	blob: Pick<BlobRecord, "blobId" | "size">,
	signal: AbortSignal,
): Promise<VerifyResult | null> {
	const [read, status] = await Promise.all([
		settle(client.walrus.readBlob({ blobId: blob.blobId, signal })),
		settle(
			client.walrus.getVerifiedBlobStatus({ blobId: blob.blobId, signal }),
		),
	]);
	if (signal.aborted) return null;
	const checked = verifyResult({
		read,
		status,
		expectedSize: blob.size,
		checkedAtMs: Date.now(),
	});
	resultsFor(client).set(blob.blobId, checked);
	return checked;
}

async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
	try {
		return { ok: true, value: await promise };
	} catch (error) {
		return { ok: false, error };
	}
}
