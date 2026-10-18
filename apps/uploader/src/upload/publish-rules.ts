import type { PublishTarget } from "@/morse/read-publish-targets";
import type { UploadPlan } from "./upload-plan";

/**
 * When an upload can also be published to Morse, from the contract's rules
 * (Morse docs, "Entries" and "Collections"): only deletable blobs, a blob
 * collection takes standalone blobs and a quilt collection quilt files,
 * entry names are at most 256 characters, and encrypted entries use the
 * publication's own Seal policy rather than a RecipientFile.
 */

/** A publication and collection an upload's entries go into. */
export interface PublishChoice {
	publicationId: string;
	publicationName: string;
	publisherCapId: string;
	collectionName: string;
	storageMode: "blob" | "quilt";
}

/** `ENameTooLong` aborts above this many bytes (`string::length` in `entry.move`). */
const MAX_ENTRY_NAME_BYTES = 256;
const UTF8 = new TextEncoder();

export type PublishBlocker =
	| { kind: "encrypted" }
	| { kind: "not-deletable" }
	| { kind: "mixed" }
	| { kind: "name-too-long"; name: string };

export function publishBlocker(
	plan: UploadPlan,
	{ encrypt, deletable }: { encrypt: boolean; deletable: boolean },
): PublishBlocker | null {
	if (encrypt) return { kind: "encrypted" };
	if (!deletable) return { kind: "not-deletable" };
	if (collectionMode(plan) === null) return { kind: "mixed" };
	const long = entryNames(plan).find(
		(name) => UTF8.encode(name).length > MAX_ENTRY_NAME_BYTES,
	);
	return long ? { kind: "name-too-long", name: long } : null;
}

export const PUBLISH_BLOCKER_TEXT: Readonly<
	Record<Exclude<PublishBlocker["kind"], "name-too-long">, string>
> = {
	encrypted:
		"Encrypted files use a RecipientFile as their access policy, which Morse entries do not take. Turn off Seal to publish.",
	"not-deletable":
		"Morse only takes deletable blobs, so a publication can unpublish and correct. Turn on Deletable to publish.",
	mixed:
		"A collection holds either blobs or quilt files, and this upload has both. Choose one blob per file to publish it.",
};

/** The collection mode every item fits, or `null` when the upload mixes quilts and blobs. */
export function collectionMode(plan: UploadPlan): "blob" | "quilt" | null {
	const kinds = new Set(plan.items.map((item) => item.kind));
	if (kinds.size !== 1) return null;
	return kinds.has("quilt") ? "quilt" : "blob";
}

/** Each entry the upload would add: one per blob, one per file of a quilt. */
export function entryNames(plan: UploadPlan): string[] {
	return plan.items.flatMap((item) =>
		item.kind === "quilt"
			? item.patches.map((patch) => patch.identifier)
			: [item.name],
	);
}

/** Every publication and collection the upload fits, as choices for the picker. */
export function publishChoices(
	targets: readonly PublishTarget[],
	mode: "blob" | "quilt",
): PublishChoice[] {
	return targets.flatMap((target) =>
		target.collections
			.filter((collection) => collection.storageMode === mode)
			.map((collection) => ({
				publicationId: target.publicationId,
				publicationName: target.publicationName,
				publisherCapId: target.publisherCapId,
				collectionName: collection.name,
				storageMode: collection.storageMode,
			})),
	);
}

/**
 * A choice as the picker shows it: "Publication · collection", with the
 * publication's short id added when two publications share a name.
 */
export function choiceLabel(
	choice: PublishChoice,
	choices: readonly PublishChoice[],
): string {
	const shared = choices.some(
		(other) =>
			other.publicationName === choice.publicationName &&
			other.publicationId !== choice.publicationId,
	);
	const id = choice.publicationId;
	const publication = shared
		? `${choice.publicationName} (${id.slice(0, 6)}…${id.slice(-4)})`
		: choice.publicationName;
	return `${publication} · ${choice.collectionName}`;
}

/** A stable key for a choice, for the picker's options. */
export function choiceKey(choice: PublishChoice): string {
	return `${choice.publicationId}:${choice.collectionName}`;
}
