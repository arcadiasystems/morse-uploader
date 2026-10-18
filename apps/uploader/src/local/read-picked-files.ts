import type { PickedFile } from "./local-library";

/**
 * Files from a drop, with their paths. Folders are walked through the
 * File and Directory Entries API, which every current browser supports for
 * drops. The entries must be taken while the drop event runs; the walk
 * itself can finish later.
 */
export function readDroppedItems(
	transfer: DataTransfer,
): Promise<PickedFile[]> {
	const entries: FileSystemEntry[] = [];
	const loose: File[] = [];
	for (const item of Array.from(transfer.items)) {
		if (item.kind !== "file") continue;
		const entry = item.webkitGetAsEntry();
		if (entry) entries.push(entry);
		else {
			const file = item.getAsFile();
			if (file) loose.push(file);
		}
	}
	return Promise.all(entries.map((entry) => walk(entry))).then((walked) => [
		...walked.flat(),
		...loose.map((file) => ({ path: file.name, file })),
	]);
}

/**
 * Files from an `<input type="file">`: a folder picker (`webkitdirectory`)
 * reports each file's path from the chosen folder, a file picker only names.
 */
export function readInputFiles(files: FileList): PickedFile[] {
	return Array.from(files, (file) => ({
		path: file.webkitRelativePath || file.name,
		file,
	}));
}

async function walk(entry: FileSystemEntry): Promise<PickedFile[]> {
	if (isFile(entry)) {
		const file = await new Promise<File>((resolve, reject) =>
			entry.file(resolve, reject),
		);
		return [{ path: entry.fullPath, file }];
	}
	if (!isDirectory(entry)) return [];
	const children = await readAllEntries(entry.createReader());
	const nested = await Promise.all(children.map((child) => walk(child)));
	return nested.flat();
}

/** `readEntries` returns a batch at a time; it is called until a batch is empty. */
async function readAllEntries(
	reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
	const all: FileSystemEntry[] = [];
	for (;;) {
		const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
			reader.readEntries(resolve, reject),
		);
		if (batch.length === 0) return all;
		all.push(...batch);
	}
}

function isFile(entry: FileSystemEntry): entry is FileSystemFileEntry {
	return entry.isFile;
}

function isDirectory(
	entry: FileSystemEntry,
): entry is FileSystemDirectoryEntry {
	return entry.isDirectory;
}
