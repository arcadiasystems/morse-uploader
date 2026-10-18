/** A small external store for useSyncExternalStore, persisted to localStorage when it can be. */
export interface PersistedStore<T> {
	get(): T;
	set(next: T): void;
	subscribe(listener: () => void): () => void;
}

export interface PersistedStoreOptions<T> {
	/** The localStorage key. */
	key: string;
	/** The value when nothing valid is stored. */
	fallback: T;
	/** Turns the stored string back into a value, or `null` when it is not valid. */
	parse: (raw: string) => T | null;
	serialize: (value: T) => string;
	/** Where to persist; `null` keeps the store in memory only. */
	storage: Storage | null;
}

/**
 * Creates a store whose value survives reloads when storage works and stays in
 * memory when it does not. Persistence is a per-viewer convenience: a blocked
 * or full storage never breaks the app, it only means the value is forgotten
 * on reload. Changes made in other tabs are picked up through `storage` events.
 */
export function createPersistedStore<T>(
	options: PersistedStoreOptions<T>,
): PersistedStore<T> {
	const { key, fallback, parse, serialize } = options;
	let storage = options.storage;
	let snapshot: T | undefined;
	const listeners = new Set<() => void>();

	function read(): T {
		if (!storage) return fallback;
		try {
			const raw = storage.getItem(key);
			return raw === null ? fallback : (parse(raw) ?? fallback);
		} catch {
			// Reading failed (storage revoked mid-session): continue in memory.
			storage = null;
			return fallback;
		}
	}

	function notify(): void {
		for (const listener of listeners) listener();
	}

	function onStorageEvent(event: StorageEvent): void {
		if (event.key !== key) return;
		snapshot = read();
		notify();
	}

	return {
		get() {
			if (snapshot === undefined) snapshot = read();
			return snapshot;
		},
		set(next) {
			snapshot = next;
			if (storage) {
				try {
					storage.setItem(key, serialize(next));
				} catch {
					// Quota or a blocked write: keep the value in memory for this session.
					storage = null;
				}
			}
			notify();
		},
		subscribe(listener) {
			listeners.add(listener);
			if (listeners.size === 1 && typeof window !== "undefined") {
				window.addEventListener("storage", onStorageEvent);
			}
			return () => {
				listeners.delete(listener);
				if (listeners.size === 0 && typeof window !== "undefined") {
					window.removeEventListener("storage", onStorageEvent);
				}
			};
		},
	};
}
