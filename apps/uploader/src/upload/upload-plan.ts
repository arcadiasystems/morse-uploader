import {
	BLOB_TYPE_ATTRIBUTE,
	CONTENT_TYPE_ATTRIBUTE,
	NAME_ATTRIBUTE,
	QUILT_BLOB_TYPE,
	SEAL_ATTRIBUTE,
} from "@/blobs/blob-attributes";
import {
	type LocalFile,
	type LocalLibrary,
	pathInFolder,
} from "@/local/local-library";
import { assignIdentifiers, type IdentifierProblem } from "./quilt-identifier";
import { maxQuiltFiles, quiltLayout } from "./quilt-layout";
import { type SealEnvelope, sealCiphertextSize } from "./seal-ciphertext-size";

/**
 * What an upload creates from the selected files: one quilt per dropped
 * folder with its paths kept, or one blob per file. Loose files are always
 * blobs. Seal encrypts each file on its own (PROTOCOL-NOTES section 11 and
 * section 13, items 14 and 15), so an encrypted upload is one blob per file.
 */

export type UploadMode = "quilt" | "per-file";

/**
 * The public upload relay accepts at most 1 GiB per upload
 * (`DefaultBodyLimit` in walrus-upload-relay, PROTOCOL-NOTES section 1).
 */
export const RELAY_MAX_UPLOAD_BYTES = 1_073_741_824;

const FALLBACK_CONTENT_TYPE = "application/octet-stream";

/** How an encrypted upload is sealed. */
export interface SealSettings {
	envelope: SealEnvelope;
	/** The Seal policy package: written as the blob's `seal` attribute. */
	policyPackageId: string;
}

export interface PlanPatch {
	file: LocalFile;
	identifier: string;
	contentType: string;
	/** Stored with the patch in the quilt; the MIME type when the browser knows it. */
	tags: Readonly<Record<string, string>>;
}

interface PlanItemBase {
	/** Stable across re-plans: the folder's root id, or the file's id. */
	key: string;
	/** Written as the blob's `name` attribute, which the Walrus pane shows. */
	name: string;
	/** Bytes the relay receives: the file, its ciphertext, or the whole quilt. */
	uploadBytes: number;
	/** Bytes of the selected files before encryption or quilt padding. */
	contentBytes: number;
}

export interface BlobPlanItem extends PlanItemBase {
	kind: "blob";
	file: LocalFile;
	contentType: string;
	/** Set when the file is encrypted before upload. */
	seal: SealSettings | null;
}

export interface QuiltPlanItem extends PlanItemBase {
	kind: "quilt";
	patches: readonly PlanPatch[];
}

export type PlanItem = BlobPlanItem | QuiltPlanItem;

/** A selected file a quilt cannot hold, and why. It is left out of the upload. */
export interface LeftOutFile {
	quiltName: string;
	file: LocalFile;
	identifier: string;
	problem: IdentifierProblem;
}

/** Something that stops the whole upload until the selection or mode changes. */
export type PlanProblem =
	| { kind: "too-large"; name: string; bytes: number }
	| { kind: "too-many-files"; name: string; files: number; limit: number }
	| { kind: "nothing-left"; name: string };

export interface UploadPlan {
	items: readonly PlanItem[];
	leftOut: readonly LeftOutFile[];
	problems: readonly PlanProblem[];
	/** Dropped folders with something selected. */
	folders: number;
	/** Selected files dropped on their own, outside a folder. */
	looseFiles: number;
	/** Every selected file. */
	files: number;
	/** Bytes of every selected file. */
	contentBytes: number;
}

export interface PlanInput {
	library: LocalLibrary;
	selected: ReadonlySet<string>;
	mode: UploadMode;
	/** How to seal files when encryption is on, `null` for a public upload. */
	seal: SealSettings | null;
	nShards: number;
}

export function buildUploadPlan({
	library,
	selected,
	mode,
	seal,
	nShards,
}: PlanInput): UploadPlan {
	const items: PlanItem[] = [];
	const leftOut: LeftOutFile[] = [];
	const problems: PlanProblem[] = [];
	let folders = 0;
	let looseFiles = 0;
	let files = 0;
	let contentBytes = 0;

	for (const root of library) {
		const chosen = root.files.filter((file) => selected.has(file.id));
		if (chosen.length === 0) continue;
		if (root.kind === "folder") folders += 1;
		else looseFiles += chosen.length;
		files += chosen.length;
		contentBytes += sum(chosen.map((file) => file.size));

		if (root.kind === "folder" && mode === "quilt" && seal === null) {
			const quilt = planQuilt(root.id, root.name, chosen, nShards);
			leftOut.push(...quilt.leftOut);
			if (quilt.problem) problems.push(quilt.problem);
			else if (quilt.item) items.push(quilt.item);
			continue;
		}
		for (const file of chosen) {
			const item = planBlob(file, seal);
			if (item.uploadBytes > RELAY_MAX_UPLOAD_BYTES)
				problems.push({
					kind: "too-large",
					name: item.name,
					bytes: item.uploadBytes,
				});
			else items.push(item);
		}
	}
	return { items, leftOut, problems, folders, looseFiles, files, contentBytes };
}

function planBlob(file: LocalFile, seal: SealSettings | null): BlobPlanItem {
	return {
		kind: "blob",
		key: file.id,
		name: file.path,
		file,
		contentType: file.type || FALLBACK_CONTENT_TYPE,
		seal,
		contentBytes: file.size,
		uploadBytes: seal
			? sealCiphertextSize(file.size, seal.envelope)
			: file.size,
	};
}

function planQuilt(
	key: string,
	name: string,
	chosen: readonly LocalFile[],
	nShards: number,
): {
	item: QuiltPlanItem | null;
	leftOut: LeftOutFile[];
	problem: PlanProblem | null;
} {
	const { accepted, rejected } = assignIdentifiers(
		chosen.map((file) => ({ item: file, pathInFolder: pathInFolder(file) })),
	);
	const leftOut = rejected.map(({ item, identifier, problem }) => ({
		quiltName: name,
		file: item,
		identifier,
		problem,
	}));
	if (accepted.length === 0)
		return { item: null, leftOut, problem: { kind: "nothing-left", name } };
	const limit = maxQuiltFiles(nShards);
	if (accepted.length > limit)
		return {
			item: null,
			leftOut,
			problem: { kind: "too-many-files", name, files: accepted.length, limit },
		};

	const patches = accepted.map(
		({ item: file, identifier }): PlanPatch => ({
			file,
			identifier,
			contentType: file.type || FALLBACK_CONTENT_TYPE,
			tags: file.type ? { [CONTENT_TYPE_ATTRIBUTE]: file.type } : {},
		}),
	);
	const contentBytes = sum(patches.map((patch) => patch.file.size));
	const layout = quiltLayout(
		patches.map((patch) => ({
			identifier: patch.identifier,
			tags: patch.tags,
			contentBytes: patch.file.size,
		})),
		nShards,
	);
	// Too many files was ruled out above, so a failed layout is oversize.
	if (!layout.ok)
		return {
			item: null,
			leftOut,
			problem: { kind: "too-large", name, bytes: contentBytes },
		};
	if (layout.bodyBytes > RELAY_MAX_UPLOAD_BYTES)
		return {
			item: null,
			leftOut,
			problem: { kind: "too-large", name, bytes: layout.bodyBytes },
		};
	return {
		item: {
			kind: "quilt",
			key,
			name,
			patches,
			contentBytes,
			uploadBytes: layout.bodyBytes,
		},
		leftOut,
		problem: null,
	};
}

/**
 * The attributes written at register, which the Walrus pane reads: the
 * name; the quilt marker (`writeFilesFlow` adds the same one); the Seal
 * policy package for an encrypted blob; the MIME type for a public one.
 * Attributes are public, so an encrypted blob carries no MIME type.
 */
export function blobAttributes(item: PlanItem): Record<string, string> {
	if (item.kind === "quilt")
		return {
			[BLOB_TYPE_ATTRIBUTE]: QUILT_BLOB_TYPE,
			[NAME_ATTRIBUTE]: item.name,
		};
	if (item.seal)
		return {
			[NAME_ATTRIBUTE]: item.name,
			[SEAL_ATTRIBUTE]: item.seal.policyPackageId,
		};
	return {
		[NAME_ATTRIBUTE]: item.name,
		[CONTENT_TYPE_ATTRIBUTE]: item.contentType,
	};
}

function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}
