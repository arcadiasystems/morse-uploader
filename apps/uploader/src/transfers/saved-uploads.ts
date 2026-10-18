import type { NetworkId } from "@/network/networks";
import type { RecordPlan } from "./record-plan";
import type { TransferItem } from "./transfer-state";

/**
 * Everything Finish needs once an upload is on the storage nodes, saved in
 * IndexedDB as PROTOCOL-NOTES section 6 asks: the item, its blob and object
 * ids, the storage certificate and the epoch it was issued in, and the
 * Morse transactions still to make. It is deleted once the item is done.
 */
export interface SavedUpload {
	item: TransferItem;
	deletable: boolean;
	/** The `uploaded` step's certificate, base64 BCS. */
	certificate: string;
	/** The Walrus epoch the certificate was issued in; it is only valid in that epoch. */
	certificateEpoch: number;
	record: RecordPlan;
}

export interface SavedUploadStore {
	save(upload: SavedUpload): Promise<void>;
	remove(id: string): Promise<void>;
	list(network: NetworkId, owner: string): Promise<SavedUpload[]>;
	/** `false` when the browser refused IndexedDB and uploads live in memory only. */
	durable(): Promise<boolean>;
}

const DATABASE = "morse-uploader";
const VERSION = 1;
const STORE = "saved-uploads";

/**
 * The IndexedDB store, or one in memory when the browser has no IndexedDB
 * or refuses it (private windows): uploads then cannot be finished after a
 * reload, but nothing else changes. The database opens on first use.
 */
export function createSavedUploads(): SavedUploadStore {
	let opened: Promise<SavedUploadStore> | null = null;
	const store = () => {
		opened ??= openStore();
		return opened;
	};
	return {
		save: async (upload) => (await store()).save(upload),
		remove: async (id) => (await store()).remove(id),
		list: async (network, owner) => (await store()).list(network, owner),
		durable: async () => (await store()).durable(),
	};
}

async function openStore(): Promise<SavedUploadStore> {
	if (typeof indexedDB === "undefined") return memoryStore();
	try {
		return indexedDbStore(await openDatabase());
	} catch (error) {
		// Blocked or refused storage: keep this session's uploads in memory.
		if (error instanceof DOMException) return memoryStore();
		throw error;
	}
}

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE, VERSION);
		request.onupgradeneeded = () => {
			request.result.createObjectStore(STORE, { keyPath: "item.id" });
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

function indexedDbStore(database: IDBDatabase): SavedUploadStore {
	/** Resolves when the transaction commits, so a write that is aborted (quota) is reported. */
	function run<T>(
		mode: IDBTransactionMode,
		operation: (store: IDBObjectStore) => IDBRequest<T>,
	): Promise<T> {
		return new Promise((resolve, reject) => {
			const transaction = database.transaction(STORE, mode);
			const request = operation(transaction.objectStore(STORE));
			transaction.oncomplete = () => resolve(request.result);
			transaction.onabort = () => reject(transaction.error ?? request.error);
			transaction.onerror = () => reject(transaction.error ?? request.error);
		});
	}
	return {
		async save(upload) {
			await run("readwrite", (store) => store.put(upload));
		},
		async remove(id) {
			await run("readwrite", (store) => store.delete(id));
		},
		async list(network, owner) {
			const all: SavedUpload[] = await run("readonly", (store) =>
				store.getAll(),
			);
			return all.filter(
				(upload) =>
					upload.item.network === network && upload.item.owner === owner,
			);
		},
		durable: async () => true,
	};
}

function memoryStore(): SavedUploadStore {
	const uploads = new Map<string, SavedUpload>();
	return {
		async save(upload) {
			uploads.set(upload.item.id, upload);
		},
		async remove(id) {
			uploads.delete(id);
		},
		async list(network, owner) {
			return [...uploads.values()].filter(
				(upload) =>
					upload.item.network === network && upload.item.owner === owner,
			);
		},
		durable: async () => false,
	};
}
