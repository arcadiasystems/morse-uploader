/**
 * The files the user dropped or picked for an upload. A dropped folder is
 * one root holding every file under it; a dropped file is a root of its
 * own. Nothing is read until an upload starts: a `File` is a handle.
 */

export interface LocalFile {
	/** Unique within the library. */
	id: string;
	/**
	 * POSIX path from the dropped item, the folder's own name included:
	 * `site-export/assets/a.png`. A loose file's path is its name.
	 */
	path: string;
	name: string;
	size: number;
	/** The MIME type the browser reports, or "" when it does not know one. */
	type: string;
	lastModified: number;
	file: File;
}

export interface LocalRoot {
	id: string;
	kind: "folder" | "file";
	name: string;
	/** Every file under the folder, in path order; a file root holds one. */
	files: readonly LocalFile[];
}

export type LocalLibrary = readonly LocalRoot[];

const PATH_COLLATOR = new Intl.Collator("en", {
	numeric: true,
	sensitivity: "base",
});

/** A file as a picker or a drop delivers it: its path from the dropped item. */
export interface PickedFile {
	path: string;
	file: File;
}

/**
 * Groups picked files into roots by the first segment of their path: files
 * under a folder share one root, files without a folder are roots of their
 * own. Roots keep the order they were first seen in. `makeId` names each
 * new root.
 */
export function rootsFromPicked(
	picked: readonly PickedFile[],
	makeId: () => string,
): LocalRoot[] {
	const order: (LocalRoot | { folder: string })[] = [];
	const folders = new Map<string, PickedFile[]>();
	for (const entry of picked) {
		const path = normalizePath(entry.path || entry.file.name);
		const slash = path.indexOf("/");
		if (slash === -1) {
			const id = makeId();
			order.push({
				id,
				kind: "file",
				name: path,
				files: [localFile(id, path, entry.file)],
			});
			continue;
		}
		const folder = path.slice(0, slash);
		const group = folders.get(folder);
		if (group) group.push({ path, file: entry.file });
		else {
			folders.set(folder, [{ path, file: entry.file }]);
			order.push({ folder });
		}
	}
	return order.map((slot) => {
		if (!("folder" in slot)) return slot;
		const id = makeId();
		const files = (folders.get(slot.folder) ?? [])
			.map((entry) => localFile(id, entry.path, entry.file))
			.sort((a, b) => comparePaths(a.path, b.path));
		return { id, kind: "folder", name: slot.folder, files };
	});
}

/** Every file in the library. */
export function allFiles(library: LocalLibrary): LocalFile[] {
	return library.flatMap((root) => root.files);
}

/** A path relative to its root folder: `site-export/assets/a.png` gives `assets/a.png`. */
export function pathInFolder(file: Pick<LocalFile, "path">): string {
	const slash = file.path.indexOf("/");
	return slash === -1 ? file.path : file.path.slice(slash + 1);
}

/** Natural order for names and paths: digits compare as numbers, case is ignored. */
function comparePaths(a: string, b: string): number {
	return PATH_COLLATOR.compare(a, b);
}

function localFile(rootId: string, path: string, file: File): LocalFile {
	return {
		id: `${rootId}:${path}`,
		path,
		name: path.slice(path.lastIndexOf("/") + 1),
		size: file.size,
		type: file.type,
		lastModified: file.lastModified,
		file,
	};
}

/** Backslashes to slashes, and no leading `./` or `/`: drops report `/folder/a.txt`. */
function normalizePath(path: string): string {
	return path.replaceAll("\\", "/").replace(/^(\.\/|\/)+/, "");
}
