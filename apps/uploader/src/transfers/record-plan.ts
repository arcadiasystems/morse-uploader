import type { PublishChoice } from "@/upload/publish-rules";
import type { PlanItem } from "@/upload/upload-plan";

/**
 * The Morse transactions an item makes after it is certified: a
 * RecipientFile for an encrypted file (its Seal access policy,
 * PROTOCOL-NOTES section 11), and one entry per file when the upload is
 * also published (section 12). Kept with the saved upload, so Finish can
 * make them after a reload.
 */

export interface EntryPlan {
	/** The entry's name: a blob's name, or a quilt file's identifier. */
	name: string;
	contentType: string;
	/** A quilt file's columns, known once the quilt is encoded; `null` for a blob. */
	patch: { startIndex: number; endIndex: number } | null;
}

export interface RecipientFilePlan {
	/** The file's name, at most 256 bytes (`recipient_file.move`). */
	name: string;
	contentType: string;
	/** The plaintext size, as the Move contract records it. */
	size: number;
	/**
	 * Hex of the Seal identity prefix the file was encrypted under, set once
	 * it is encrypted. Public: the RecipientFile binds it on chain.
	 */
	sealIdPrefixHex: string | null;
}

export interface RecordPlan {
	publish: { target: PublishChoice; entries: readonly EntryPlan[] } | null;
	recipientFile: RecipientFilePlan | null;
}

export function recordTransactions(plan: RecordPlan): number {
	return (plan.recipientFile ? 1 : 0) + (plan.publish?.entries.length ?? 0);
}

/**
 * The Morse transactions planned for an item when it is queued: a
 * RecipientFile when it is encrypted (its prefix comes with the
 * encryption), and an entry per file when it is published. A quilt file's
 * columns are filled in once the quilt is encoded.
 */
export function recordPlanFor(
	item: PlanItem,
	publish: PublishChoice | null,
): RecordPlan {
	const recipientFile: RecipientFilePlan | null =
		item.kind === "blob" && item.seal
			? {
					// The file's own name: a filesystem keeps it under 256 bytes, the
					// RecipientFile's limit, where a deep path might not be.
					name: item.file.name,
					contentType: item.contentType,
					size: item.contentBytes,
					sealIdPrefixHex: null,
				}
			: null;
	if (!publish) return { publish: null, recipientFile };
	const entries: EntryPlan[] =
		item.kind === "quilt"
			? item.patches.map((patch) => ({
					name: patch.identifier,
					contentType: patch.contentType,
					patch: null,
				}))
			: [{ name: item.name, contentType: item.contentType, patch: null }];
	return { publish: { target: publish, entries }, recipientFile };
}

/** A Morse transaction the record step made. */
export type TransferRecord =
	/** `entryId` is `null` when the entry was found on chain after its result was lost. */
	| { kind: "entry"; entryId: number | null; name: string; digest: string }
	| { kind: "recipient-file"; fileId: string; digest: string };
