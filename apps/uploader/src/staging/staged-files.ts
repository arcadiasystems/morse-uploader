import type { LocalFile, LocalLibrary, LocalRoot } from "@/local/local-library";

/**
 * What the staging tray holds: the roots dropped or picked, in the order
 * they were staged. A root is a folder with every file under it, paths
 * kept, or a file on its own (the local library's shape). A file's bytes
 * are its `File`; after a reload they come back from IndexedDB when the
 * browser kept them, and are `null` when it did not.
 */
export interface StagedFile extends Omit<LocalFile, "file"> {
	file: File | null;
}

export interface StagedRoot extends Omit<LocalRoot, "files"> {
	files: readonly StagedFile[];
}

/** Whether every file of a root still has its bytes, so it can upload. */
export function hasBytes(root: StagedRoot): root is LocalRoot {
	return root.files.every((file) => file.file !== null);
}

/** The roots that can upload, as the upload plan reads them. */
export function stagedLibrary(roots: readonly StagedRoot[]): LocalLibrary {
	return roots.filter(hasBytes);
}

export interface StagedTotals {
	/** Roots: folders and loose files. */
	items: number;
	files: number;
	bytes: number;
}

export function stagedTotals(roots: readonly StagedRoot[]): StagedTotals {
	return {
		items: roots.length,
		files: roots.reduce((total, root) => total + root.files.length, 0),
		bytes: roots.reduce(
			(total, root) =>
				total + root.files.reduce((sum, file) => sum + file.size, 0),
			0,
		),
	};
}

export interface StagingResult {
	roots: StagedRoot[];
	/** Names of roots added to the tray. */
	added: string[];
	/** Names of roots that came back without bytes and were staged again. */
	restored: string[];
	/** Names of roots already in the tray with the same files, left out. */
	skipped: string[];
}

/**
 * Adds newly dropped or picked roots to the tray. A root that came back
 * from a reload without its bytes is replaced in place by the same folder
 * or file staged again (same kind and name). A root already in the tray
 * with the same files (paths, sizes and modification times) is left out,
 * so a double drop does not pay twice for the same blob.
 */
export function stageRoots(
	current: readonly StagedRoot[],
	incoming: readonly LocalRoot[],
): StagingResult {
	const roots = [...current];
	const added: string[] = [];
	const restored: string[] = [];
	const skipped: string[] = [];
	for (const root of incoming) {
		const lost = roots.findIndex(
			(staged) =>
				!hasBytes(staged) &&
				staged.kind === root.kind &&
				staged.name === root.name,
		);
		if (lost !== -1) {
			roots[lost] = root;
			restored.push(root.name);
		} else if (roots.some((staged) => sameFiles(staged, root))) {
			skipped.push(root.name);
		} else {
			roots.push(root);
			added.push(root.name);
		}
	}
	return { roots, added, restored, skipped };
}

function sameFiles(a: StagedRoot, b: StagedRoot): boolean {
	return (
		a.kind === b.kind &&
		a.name === b.name &&
		a.files.length === b.files.length &&
		a.files.every((file, index) => {
			const other = b.files[index];
			return (
				other !== undefined &&
				other.path === file.path &&
				other.size === file.size &&
				other.lastModified === file.lastModified
			);
		})
	);
}
