import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { rootsFromPicked } from "@/local/local-library";
import type { StagedRoot } from "./staged-files";
import { DEFAULT_TRAY_SETTINGS } from "./tray-settings";
import { createTrayStore, trayKey } from "./tray-store";

/**
 * The IndexedDB adapter, run against fake-indexeddb: an implementation of
 * the IndexedDB API for Node, so the adapter's own transactions run here.
 * The e2e suite checks the same adapter in Chromium across a real reload.
 */
const OWNER =
	"0x4ea7c836fe1c4ac1a40a54a41622e1e60bd7dcc22188ba1e50a7c469b9ae4c75";
const OTHER =
	"0x0000000000000000000000000000000000000000000000000000000000000abc";

let next = 0;
function staged(files: Record<string, string>): StagedRoot[] {
	return rootsFromPicked(
		Object.entries(files).map(([path, text]) => ({
			path,
			file: new File([text], path.slice(path.lastIndexOf("/") + 1), {
				type: "text/plain",
				lastModified: 1_700_000_000_000,
			}),
		})),
		() => `root-${next++}`,
	);
}

/** The file ids whose bytes the database holds for a tray, read straight from IndexedDB. */
function storedBytes(factory: IDBFactory, key: string): Promise<string[]> {
	return new Promise((resolve, reject) => {
		const open = factory.open("morse-uploader-staging");
		open.onerror = () => reject(open.error);
		open.onsuccess = () => {
			const request = open.result
				.transaction("bytes")
				.objectStore("bytes")
				.index("by-tray")
				.getAll(key);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				open.result.close();
				resolve(
					(request.result as { fileId: string }[])
						.map((record) => record.fileId)
						.sort(),
				);
			};
		};
	});
}

describe("the tray's IndexedDB store", () => {
	it("keys trays by network and normalized wallet", () => {
		expect(trayKey("testnet", OWNER)).toBe(`testnet:${OWNER}`);
	});

	it("brings a saved tray back with its paths, settings and bytes", async () => {
		const factory = new IDBFactory();
		const roots = staged({
			"site/index.html": "<h1>Hi</h1>",
			"hero.png": "png",
		});
		const settings = { ...DEFAULT_TRAY_SETTINGS, mode: "per-file" as const };
		const key = trayKey("testnet", OWNER);
		expect(
			await createTrayStore(factory).save(key, { roots, settings }),
		).toEqual({
			kind: "kept",
		});

		// A new store over the same database is what a reload sees.
		const loaded = await createTrayStore(factory).load(key);
		expect(loaded?.settings).toEqual(settings);
		expect(loaded?.roots.map((root) => [root.kind, root.name])).toEqual([
			["folder", "site"],
			["file", "hero.png"],
		]);
		const file = loaded?.roots[0]?.files[0];
		expect(file?.path).toBe("site/index.html");
		expect(file?.file).toBeInstanceOf(File);
		expect(file?.file?.name).toBe("index.html");
		expect(file?.file?.type).toBe("text/plain");
		expect(await file?.file?.text()).toBe("<h1>Hi</h1>");
	});

	it("keeps each wallet's and each network's tray apart", async () => {
		const factory = new IDBFactory();
		const store = createTrayStore(factory);
		const mine = staged({ "mine.txt": "mine" });
		const theirs = staged({ "theirs.txt": "theirs" });
		await store.save(trayKey("testnet", OWNER), {
			roots: mine,
			settings: DEFAULT_TRAY_SETTINGS,
		});
		await store.save(trayKey("testnet", OTHER), {
			roots: theirs,
			settings: DEFAULT_TRAY_SETTINGS,
		});
		const names = async (key: string) =>
			(await store.load(key))?.roots.map((root) => root.name) ?? null;
		expect(await names(trayKey("testnet", OWNER))).toEqual(["mine.txt"]);
		expect(await names(trayKey("testnet", OTHER))).toEqual(["theirs.txt"]);
		expect(await names(trayKey("mainnet", OWNER))).toBeNull();
		expect(await storedBytes(factory, trayKey("testnet", OWNER))).toEqual(
			mine.flatMap((root) => root.files.map((file) => file.id)),
		);
	});

	it("deletes the bytes of files no longer staged in the same save", async () => {
		const factory = new IDBFactory();
		const store = createTrayStore(factory);
		const key = trayKey("testnet", OWNER);
		const [site, hero] = staged({ "site/a.txt": "a", "hero.png": "png" });
		if (!site || !hero) throw new Error("No roots.");
		await store.save(key, {
			roots: [site, hero],
			settings: DEFAULT_TRAY_SETTINGS,
		});
		await store.save(key, { roots: [hero], settings: DEFAULT_TRAY_SETTINGS });
		expect(await storedBytes(factory, key)).toEqual([hero.files[0]?.id]);
		// Sent or cleared: the list empties, the settings stay, no bytes are left.
		const settings = { ...DEFAULT_TRAY_SETTINGS, deletable: false };
		await store.save(key, { roots: [], settings });
		expect(await storedBytes(factory, key)).toEqual([]);
		expect(await store.load(key)).toEqual({ roots: [], settings });
	});

	it("brings a file back without bytes when its bytes are gone, keeping its path", async () => {
		const factory = new IDBFactory();
		const store = createTrayStore(factory);
		const key = trayKey("testnet", OWNER);
		const roots = staged({ "notes.md": "# notes" });
		await store.save(key, { roots, settings: DEFAULT_TRAY_SETTINGS });
		// The browser evicted the blob records, as it may under storage pressure.
		await new Promise<void>((resolve, reject) => {
			const open = factory.open("morse-uploader-staging");
			open.onsuccess = () => {
				const transaction = open.result.transaction("bytes", "readwrite");
				transaction.objectStore("bytes").clear();
				transaction.oncomplete = () => {
					open.result.close();
					resolve();
				};
				transaction.onabort = () => reject(transaction.error);
			};
		});
		const loaded = await store.load(key);
		expect(loaded?.roots[0]?.files[0]).toMatchObject({
			path: "notes.md",
			size: 7,
			file: null,
		});
	});

	it("reads a damaged record as no tray, and damaged settings as the defaults", async () => {
		const factory = new IDBFactory();
		const store = createTrayStore(factory);
		const key = trayKey("testnet", OWNER);
		await store.save(key, { roots: [], settings: DEFAULT_TRAY_SETTINGS });
		await new Promise<void>((resolve, reject) => {
			const open = factory.open("morse-uploader-staging");
			open.onsuccess = () => {
				const transaction = open.result.transaction("trays", "readwrite");
				const trays = transaction.objectStore("trays");
				trays.put({ key, roots: [{ id: 1 }], settings: {} });
				trays.put({ key: `${key}:ok`, roots: [], settings: { mode: "zip" } });
				transaction.oncomplete = () => {
					open.result.close();
					resolve();
				};
				transaction.onabort = () => reject(transaction.error);
			};
		});
		expect(await store.load(key)).toBeNull();
		expect((await store.load(`${key}:ok`))?.settings).toEqual(
			DEFAULT_TRAY_SETTINGS,
		);
	});

	it("keeps the tray in memory, and says so, where there is no IndexedDB", async () => {
		const store = createTrayStore(null);
		const key = trayKey("testnet", OWNER);
		const roots = staged({ "a.txt": "a" });
		await store.save(key, { roots, settings: DEFAULT_TRAY_SETTINGS });
		expect(await store.durable()).toBe(false);
		expect((await store.load(key))?.roots).toEqual(roots);
	});
});
