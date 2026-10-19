import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { rootsFromPicked } from "@/local/local-library";
import { StagingTrayModel } from "./staging-tray";
import { DEFAULT_TRAY_SETTINGS, parseTraySettings } from "./tray-settings";
import { createTrayStore, trayKey } from "./tray-store";

const OWNER =
	"0x4ea7c836fe1c4ac1a40a54a41622e1e60bd7dcc22188ba1e50a7c469b9ae4c75";
const OTHER =
	"0x0000000000000000000000000000000000000000000000000000000000000abc";
const MINE = trayKey("testnet", OWNER);
const THEIRS = trayKey("testnet", OTHER);

let next = 0;
function picked(files: Record<string, string>) {
	return rootsFromPicked(
		Object.entries(files).map(([path, text]) => ({
			path,
			file: new File([text], path.slice(path.lastIndexOf("/") + 1)),
		})),
		() => `root-${next++}`,
	);
}

const names = (model: StagingTrayModel) =>
	model.getState().roots.map((root) => root.name);

describe("the staging tray, persisted per wallet", () => {
	it("comes back after a reload with what was staged and its settings", async () => {
		const factory = new IDBFactory();
		const before = new StagingTrayModel(createTrayStore(factory));
		await before.open(MINE);
		before.stage(picked({ "site/index.html": "<h1>", "hero.png": "png" }));
		before.update({ keep: { kind: "epochs", epochs: 1 }, deletable: false });
		expect(before.getState().saved).toBe(false);
		await before.flush();
		expect(before.getState().saved).toBe(true);

		// A reload: a new model over the same database.
		const after = new StagingTrayModel(createTrayStore(factory));
		await after.open(MINE);
		expect(after.getState()).toMatchObject({
			key: MINE,
			status: "ready",
			saved: true,
			notice: null,
			settings: {
				...DEFAULT_TRAY_SETTINGS,
				keep: { kind: "epochs", epochs: 1 },
				deletable: false,
			},
		});
		expect(names(after)).toEqual(["site", "hero.png"]);
		const file = after.getState().roots[1]?.files[0]?.file;
		expect(await file?.text()).toBe("png");
	});

	it("shows each wallet its own tray, and none without a wallet", async () => {
		const factory = new IDBFactory();
		const model = new StagingTrayModel(createTrayStore(factory));
		await model.open(MINE);
		model.stage(picked({ "mine.txt": "mine" }));
		await model.open(THEIRS);
		expect(names(model)).toEqual([]);
		model.stage(picked({ "theirs.txt": "theirs" }));
		await model.open(MINE);
		expect(names(model)).toEqual(["mine.txt"]);
		await model.open(null);
		expect(model.getState()).toMatchObject({
			key: null,
			status: "idle",
			roots: [],
		});
		expect(model.stage(picked({ "nobody.txt": "x" }))).toBeNull();
		await model.open(THEIRS);
		expect(names(model)).toEqual(["theirs.txt"]);
	});

	it("keeps files staged while the saved tray is read back, after what was saved", async () => {
		const factory = new IDBFactory();
		const first = new StagingTrayModel(createTrayStore(factory));
		await first.open(MINE);
		first.stage(picked({ "saved.txt": "saved" }));
		await first.flush();

		const second = new StagingTrayModel(createTrayStore(factory));
		const opening = second.open(MINE);
		expect(second.getState().status).toBe("loading");
		second.stage(picked({ "dropped-early.txt": "early" }));
		await opening;
		expect(names(second)).toEqual(["saved.txt", "dropped-early.txt"]);
		await second.flush();

		const third = new StagingTrayModel(createTrayStore(factory));
		await third.open(MINE);
		expect(names(third)).toEqual(["saved.txt", "dropped-early.txt"]);
	});

	it("empties on Clear and keeps its settings for the next drop", async () => {
		const factory = new IDBFactory();
		const model = new StagingTrayModel(createTrayStore(factory));
		await model.open(MINE);
		model.stage(picked({ "a.txt": "a" }));
		model.update({ mode: "per-file" });
		model.clear();
		await model.flush();
		const reloaded = new StagingTrayModel(createTrayStore(factory));
		await reloaded.open(MINE);
		expect(reloaded.getState().roots).toEqual([]);
		expect(reloaded.getState().settings.mode).toBe("per-file");
	});

	it("says the tray only lasts the tab where the browser keeps no data", async () => {
		const model = new StagingTrayModel(createTrayStore(null));
		await model.open(MINE);
		expect(model.getState().notice).toEqual({ kind: "memory-only" });
		model.stage(picked({ "a.txt": "a" }));
		await model.flush();
		expect(model.getState().notice).toEqual({ kind: "memory-only" });
	});
});

describe("parseTraySettings", () => {
	it("takes each valid field and defaults the rest", () => {
		expect(
			parseTraySettings({
				keep: { kind: "period", id: "max" },
				encrypt: true,
				mode: "zip",
				publishTo: 7,
			}),
		).toEqual({
			...DEFAULT_TRAY_SETTINGS,
			keep: { kind: "period", id: "max" },
			encrypt: true,
		});
		expect(
			parseTraySettings({ keep: { kind: "epochs", epochs: 0 } }).keep,
		).toBeNull();
		expect(
			parseTraySettings({ keep: { kind: "period", id: "3y" } }).keep,
		).toBeNull();
		expect(parseTraySettings("broken")).toEqual(DEFAULT_TRAY_SETTINGS);
	});
});
