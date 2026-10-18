import type { NetworkId } from "@/network/networks";
import type { StagedFile, StagedRoot } from "./staged-files";
import { parseTraySettings, type TraySettings } from "./tray-settings";

/**
 * Where the staging tray survives a reload: IndexedDB, keyed by wallet
 * (the handover's build notes), one tray per wallet and network, since a
 * tray priced and set up for Testnet means nothing on Walrus Mainnet.
 *
 * The list of roots and the settings are one record. Each file's bytes are
 * a record of their own, the `File` itself, which IndexedDB stores as a
 * blob: saving the list again (a setting changed, a root removed) never
 * copies bytes again, and bytes no longer staged are deleted in the same
 * transaction. When the browser refuses the bytes (its storage for the
 * site is full), the list and settings are still saved and the files come
 * back without bytes, which the tray says. A browser with no IndexedDB, or
 * one that refuses it (some private windows), keeps the tray in memory for
 * the tab's life.
 */

export interface StoredTray {
	roots: readonly StagedRoot[];
	settings: TraySettings;
}

/** What a save kept. */
export type TraySave =
	| { kind: "kept" }
	/** The list and settings are saved, but the new files' bytes are not. */
	| { kind: "list-only"; reason: string };

export interface TrayStore {
	/** `null` when nothing is saved for this key, or the record is not readable. */
	load(key: string): Promise<StoredTray | null>;
	save(key: string, tray: StoredTray): Promise<TraySave>;
	/** `false` when the tray lives in memory only and is gone after a reload. */
	durable(): Promise<boolean>;
}

/** The tray's key: one per wallet and network. `owner` is a normalized address. */
export function trayKey(network: NetworkId, owner: string): string {
	return `${network}:${owner}`;
}

const DATABASE = "morse-uploader-staging";
const VERSION = 1;
const TRAYS = "trays";
const BYTES = "bytes";
const BY_TRAY = "by-tray";

type FileRecord = Omit<StagedFile, "file">;
type RootRecord = Omit<StagedRoot, "files"> & { files: FileRecord[] };

interface TrayRecord {
	key: string;
	roots: RootRecord[];
	settings: TraySettings;
}

interface BytesRecord {
	tray: string;
	fileId: string;
	file: File;
}

/**
 * The store over `factory` (the browser's IndexedDB by default), or one in
 * memory when there is none. The database opens on first use.
 */
export function createTrayStore(
	factory: IDBFactory | null = browserIndexedDb(),
): TrayStore {
	let opened: Promise<TrayStore> | null = null;
	const store = () => {
		opened ??= factory ? openStore(factory) : Promise.resolve(memoryStore());
		return opened;
	};
	return {
		load: async (key) => (await store()).load(key),
		save: async (key, tray) => (await store()).save(key, tray),
		durable: async () => (await store()).durable(),
	};
}

function browserIndexedDb(): IDBFactory | null {
	if (typeof window === "undefined") return null;
	try {
		return window.indexedDB ?? null;
	} catch {
		// Some browsers throw a SecurityError on access when site data is blocked.
		return null;
	}
}

async function openStore(factory: IDBFactory): Promise<TrayStore> {
	try {
		return indexedDbStore(await openDatabase(factory));
	} catch (error) {
		// Blocked or refused storage: keep this tab's tray in memory.
		if (error instanceof DOMException) return memoryStore();
		throw error;
	}
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = factory.open(DATABASE, VERSION);
		request.onupgradeneeded = () => {
			const database = request.result;
			database.createObjectStore(TRAYS, { keyPath: "key" });
			database
				.createObjectStore(BYTES, { keyPath: ["tray", "fileId"] })
				.createIndex(BY_TRAY, "tray");
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
		request.onblocked = () =>
			reject(
				new DOMException(
					"Another tab holds the database.",
					"InvalidStateError",
				),
			);
	});
}

function indexedDbStore(database: IDBDatabase): TrayStore {
	return {
		async load(key) {
			const { record, bytes } = await read(database, key);
			const roots = parseRoots(record);
			if (!roots) return null;
			const blobs = new Map<string, Blob>();
			for (const value of bytes) {
				const stored = parseBytes(value);
				if (stored) blobs.set(stored.fileId, stored.blob);
			}
			return {
				roots: roots.map((root) => ({
					...root,
					files: root.files.map((file) => ({
						...file,
						file: asFile(blobs.get(file.id), file),
					})),
				})),
				settings: parseTraySettings(
					(record as { settings?: unknown }).settings,
				),
			};
		},
		async save(key, tray) {
			const record: TrayRecord = {
				key,
				roots: tray.roots.map((root) => ({
					id: root.id,
					kind: root.kind,
					name: root.name,
					files: root.files.map(({ file: _bytes, ...meta }) => meta),
				})),
				settings: tray.settings,
			};
			const files = new Map<string, File>();
			for (const root of tray.roots)
				for (const file of root.files)
					if (file.file) files.set(file.id, file.file);
			try {
				await write(database, record, files, true);
				return { kind: "kept" };
			} catch (error) {
				if (
					!(
						error instanceof DOMException && error.name === "QuotaExceededError"
					)
				)
					throw error;
				// Keep the list, the settings and the bytes already saved; add none.
				await write(database, record, files, false);
				return {
					kind: "list-only",
					reason: "the browser's storage for this site is full",
				};
			}
		},
		durable: async () => true,
	};
}

/**
 * Saves the record and brings the bytes in line with it in one
 * transaction: bytes of files no longer staged are deleted, and, when
 * `addNew` is set, bytes of newly staged files are added. Resolves once the
 * transaction commits, so a write the browser aborts (quota) is reported.
 */
function write(
	database: IDBDatabase,
	record: TrayRecord,
	files: ReadonlyMap<string, File>,
	addNew: boolean,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const transaction = database.transaction([TRAYS, BYTES], "readwrite");
		transaction.oncomplete = () => resolve();
		transaction.onabort = () =>
			reject(
				transaction.error ??
					new DOMException("The save was aborted.", "AbortError"),
			);
		transaction.objectStore(TRAYS).put(record);
		const bytes = transaction.objectStore(BYTES);
		const keys = bytes.index(BY_TRAY).getAllKeys(record.key);
		keys.onsuccess = () => {
			const kept = new Set<string>();
			for (const key of keys.result) {
				const fileId = Array.isArray(key) ? key[1] : undefined;
				if (typeof fileId === "string" && files.has(fileId)) kept.add(fileId);
				else bytes.delete(key);
			}
			if (!addNew) return;
			for (const [fileId, file] of files)
				if (!kept.has(fileId))
					bytes.put({ tray: record.key, fileId, file } satisfies BytesRecord);
		};
	});
}

function read(
	database: IDBDatabase,
	key: string,
): Promise<{ record: unknown; bytes: unknown[] }> {
	return new Promise((resolve, reject) => {
		const transaction = database.transaction([TRAYS, BYTES], "readonly");
		const record = transaction.objectStore(TRAYS).get(key);
		const bytes = transaction.objectStore(BYTES).index(BY_TRAY).getAll(key);
		transaction.oncomplete = () =>
			resolve({ record: record.result, bytes: bytes.result });
		transaction.onabort = () =>
			reject(
				transaction.error ??
					new DOMException("The read was aborted.", "AbortError"),
			);
	});
}

/** The roots of a stored record, or `null` when there is none or it is not readable. */
function parseRoots(record: unknown): RootRecord[] | null {
	if (typeof record !== "object" || record === null) return null;
	const roots = (record as { roots?: unknown }).roots;
	if (!Array.isArray(roots)) return null;
	const parsed: RootRecord[] = [];
	for (const root of roots) {
		const valid = parseRoot(root);
		if (!valid) return null;
		parsed.push(valid);
	}
	return parsed;
}

function parseRoot(value: unknown): RootRecord | null {
	if (typeof value !== "object" || value === null) return null;
	const { id, kind, name, files } = value as Record<string, unknown>;
	if (
		typeof id !== "string" ||
		(kind !== "folder" && kind !== "file") ||
		typeof name !== "string" ||
		!Array.isArray(files)
	)
		return null;
	const parsed: FileRecord[] = [];
	for (const file of files) {
		const valid = parseFile(file);
		if (!valid) return null;
		parsed.push(valid);
	}
	return { id, kind, name, files: parsed };
}

function parseFile(value: unknown): FileRecord | null {
	if (typeof value !== "object" || value === null) return null;
	const { id, path, name, size, type, lastModified } = value as Record<
		string,
		unknown
	>;
	if (
		typeof id !== "string" ||
		typeof path !== "string" ||
		typeof name !== "string" ||
		typeof size !== "number" ||
		typeof type !== "string" ||
		typeof lastModified !== "number"
	)
		return null;
	return { id, path, name, size, type, lastModified };
}

function parseBytes(value: unknown): { fileId: string; blob: Blob } | null {
	if (typeof value !== "object" || value === null) return null;
	const { fileId, file } = value as Record<string, unknown>;
	if (typeof fileId !== "string" || !(file instanceof Blob)) return null;
	return { fileId, blob: file };
}

/**
 * The stored bytes as a `File`. Browsers give a stored `File` back as one;
 * an engine that clones it as a plain `Blob` loses the name and date, which
 * the file's record still holds.
 */
function asFile(blob: Blob | undefined, meta: FileRecord): File | null {
	if (!blob) return null;
	if (blob instanceof File) return blob;
	return new File([blob], meta.name, {
		type: meta.type,
		lastModified: meta.lastModified,
	});
}

function memoryStore(): TrayStore {
	const trays = new Map<string, StoredTray>();
	return {
		async load(key) {
			return trays.get(key) ?? null;
		},
		async save(key, tray) {
			trays.set(key, { roots: [...tray.roots], settings: tray.settings });
			return { kind: "kept" };
		},
		durable: async () => false,
	};
}
