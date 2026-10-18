import { describe, expect, it, vi } from "vitest";
import { createPersistedStore } from "./create-persisted-store";

class MemoryStorage implements Storage {
	readonly #items = new Map<string, string>();
	get length() {
		return this.#items.size;
	}
	clear() {
		this.#items.clear();
	}
	getItem(key: string) {
		return this.#items.get(key) ?? null;
	}
	key(index: number) {
		return [...this.#items.keys()][index] ?? null;
	}
	removeItem(key: string) {
		this.#items.delete(key);
	}
	setItem(key: string, value: string) {
		this.#items.set(key, value);
	}
}

class BlockedStorage extends MemoryStorage {
	override getItem(): string | null {
		throw new DOMException("blocked", "SecurityError");
	}
	override setItem(): void {
		throw new DOMException("full", "QuotaExceededError");
	}
}

const numberStore = (storage: Storage | null) =>
	createPersistedStore<number>({
		key: "count",
		fallback: 0,
		parse: (raw) => (/^\d+$/.test(raw) ? Number(raw) : null),
		serialize: String,
		storage,
	});

describe("createPersistedStore", () => {
	it("reads the stored value and writes changes back", () => {
		const storage = new MemoryStorage();
		storage.setItem("count", "4");
		const store = numberStore(storage);
		expect(store.get()).toBe(4);
		store.set(5);
		expect(store.get()).toBe(5);
		expect(storage.getItem("count")).toBe("5");
	});

	it("falls back when nothing or something invalid is stored", () => {
		expect(numberStore(new MemoryStorage()).get()).toBe(0);
		const storage = new MemoryStorage();
		storage.setItem("count", "not a number");
		expect(numberStore(storage).get()).toBe(0);
	});

	it("keeps a stable snapshot between reads", () => {
		const store = createPersistedStore<{ n: number }>({
			key: "object",
			fallback: { n: 0 },
			parse: (raw) => JSON.parse(raw) as { n: number },
			serialize: JSON.stringify,
			storage: new MemoryStorage(),
		});
		expect(store.get()).toBe(store.get());
	});

	it("works in memory when storage is missing or blocked", () => {
		for (const storage of [null, new BlockedStorage()]) {
			const store = numberStore(storage);
			expect(store.get()).toBe(0);
			store.set(7);
			expect(store.get()).toBe(7);
		}
	});

	it("notifies subscribers until they unsubscribe", () => {
		const store = numberStore(new MemoryStorage());
		const listener = vi.fn();
		const unsubscribe = store.subscribe(listener);
		store.set(1);
		expect(listener).toHaveBeenCalledTimes(1);
		unsubscribe();
		store.set(2);
		expect(listener).toHaveBeenCalledTimes(1);
	});
});
