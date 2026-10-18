import {
	comparePaths,
	type LocalFile,
	type LocalLibrary,
} from "./local-library";

/** One visible row of the local tree: a folder at any depth, or a file. */
export type LocalRow =
	| {
			kind: "folder";
			key: string;
			depth: number;
			name: string;
			/** Every file under the folder, at any depth. */
			fileIds: readonly string[];
			size: number;
			expanded: boolean;
	  }
	| { kind: "file"; key: string; depth: number; file: LocalFile };

/** Row heights in px: a folder has a second line with its file count. */
export const LOCAL_ROW_HEIGHT: Readonly<Record<LocalRow["kind"], number>> = {
	folder: 50,
	file: 38,
};

interface FolderNode {
	name: string;
	key: string;
	folders: Map<string, FolderNode>;
	files: LocalFile[];
}

/**
 * The library as tree rows, folders before files at each level, in natural
 * order. A folder's children show when its key is in `expanded`.
 */
export function buildLocalRows(
	library: LocalLibrary,
	expanded: ReadonlySet<string>,
): LocalRow[] {
	const rows: LocalRow[] = [];
	for (const root of library) {
		if (root.kind === "file") {
			for (const file of root.files)
				rows.push({ kind: "file", key: file.id, depth: 0, file });
			continue;
		}
		pushFolder(rows, folderTree(root.id, root.name, root.files), 0, expanded);
	}
	return rows;
}

function folderTree(
	rootId: string,
	name: string,
	files: readonly LocalFile[],
): FolderNode {
	const top: FolderNode = {
		name,
		key: `${rootId}:${name}/`,
		folders: new Map(),
		files: [],
	};
	for (const file of files) {
		const segments = file.path.split("/").slice(1, -1);
		let node = top;
		for (const segment of segments) {
			let child = node.folders.get(segment);
			if (!child) {
				child = {
					name: segment,
					key: `${node.key}${segment}/`,
					folders: new Map(),
					files: [],
				};
				node.folders.set(segment, child);
			}
			node = child;
		}
		node.files.push(file);
	}
	return top;
}

function pushFolder(
	rows: LocalRow[],
	node: FolderNode,
	depth: number,
	expanded: ReadonlySet<string>,
): void {
	const files = filesUnder(node);
	const open = expanded.has(node.key);
	rows.push({
		kind: "folder",
		key: node.key,
		depth,
		name: node.name,
		fileIds: files.map((file) => file.id),
		size: files.reduce((total, file) => total + file.size, 0),
		expanded: open,
	});
	if (!open) return;
	const folders = [...node.folders.values()].sort((a, b) =>
		comparePaths(a.name, b.name),
	);
	for (const folder of folders) pushFolder(rows, folder, depth + 1, expanded);
	const sorted = [...node.files].sort((a, b) => comparePaths(a.name, b.name));
	for (const file of sorted)
		rows.push({ kind: "file", key: file.id, depth: depth + 1, file });
}

function filesUnder(node: FolderNode): LocalFile[] {
	return [
		...node.files,
		...[...node.folders.values()].flatMap((folder) => filesUnder(folder)),
	];
}

export type Selection = "all" | "some" | "none";

/** How much of a set of files is selected, for a folder's checkbox. */
export function selectionOf(
	fileIds: readonly string[],
	selected: ReadonlySet<string>,
): Selection {
	const chosen = fileIds.filter((id) => selected.has(id)).length;
	if (chosen === 0) return "none";
	return chosen === fileIds.length ? "all" : "some";
}

/** Selects or clears every file in `fileIds`. */
export function setSelected(
	selected: ReadonlySet<string>,
	fileIds: readonly string[],
	on: boolean,
): Set<string> {
	const next = new Set(selected);
	for (const id of fileIds) {
		if (on) next.add(id);
		else next.delete(id);
	}
	return next;
}
