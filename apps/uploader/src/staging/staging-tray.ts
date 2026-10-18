import { errorMessage } from "@/lib/error-message";
import type { LocalRoot } from "@/local/local-library";
import {
	hasBytes,
	type StagedRoot,
	type StagingResult,
	stageRoots,
} from "./staged-files";
import { DEFAULT_TRAY_SETTINGS, type TraySettings } from "./tray-settings";
import type { StoredTray, TrayStore } from "./tray-store";

/** Something about saving the tray the user should know. */
export type TrayNotice =
	/** The browser refused IndexedDB: the tray is gone after a reload. */
	| { kind: "memory-only" }
	/** The list is saved, but the newest files' bytes are not. */
	| { kind: "list-only"; reason: string }
	| { kind: "load-failed"; message: string }
	| { kind: "save-failed"; message: string };

export interface TrayState {
	/** The wallet and network the tray belongs to (`trayKey`); `null` without a wallet. */
	key: string | null;
	/** `loading` while the saved tray is read back for `key`. */
	status: "idle" | "loading" | "ready";
	roots: readonly StagedRoot[];
	settings: TraySettings;
	/** Whether the tray as shown is saved, so a reload brings it back. */
	saved: boolean;
	notice: TrayNotice | null;
}

const IDLE: TrayState = {
	key: null,
	status: "idle",
	roots: [],
	settings: DEFAULT_TRAY_SETTINGS,
	saved: true,
	notice: null,
};

/**
 * The staging tray (handover item 2): drops accumulate here with their
 * settings until Sign and send, and the tray survives a reload. One tray
 * per wallet and network; switching wallet shows that wallet's tray.
 *
 * Every change is saved, in order: a change made while a save runs is
 * saved right after it, with whatever is newest by then. Files staged
 * while the saved tray is still being read back join it rather than
 * replace it. React reads the state with `useSyncExternalStore`.
 */
export class StagingTrayModel {
	#state: TrayState = IDLE;
	readonly #listeners = new Set<() => void>();
	readonly #store: TrayStore;
	/** The newest tray per key that a queued save will write. */
	readonly #unsaved = new Map<string, StoredTray>();
	#saving: Promise<void> = Promise.resolve();
	#durable = true;
	/** Settings changed while the saved tray loaded win over the saved ones. */
	#settingsTouched = false;

	constructor(store: TrayStore) {
		this.#store = store;
	}

	getState = (): TrayState => this.#state;

	subscribe = (listener: () => void): (() => void) => {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	};

	/** Shows the tray of a wallet and network, read back from storage, or none. */
	async open(key: string | null): Promise<void> {
		if (key === this.#state.key) return;
		this.#settingsTouched = false;
		if (key === null) {
			this.#set(IDLE);
			return;
		}
		this.#set({ ...IDLE, key, status: "loading" });
		let loaded: StoredTray | null = null;
		let notice: TrayNotice | null = null;
		try {
			// A save for this key still on its way lands before it is read back.
			await this.#saving;
			const [tray, durable] = await Promise.all([
				this.#store.load(key),
				this.#store.durable(),
			]);
			loaded = tray;
			this.#durable = durable;
			if (!durable) notice = { kind: "memory-only" };
		} catch (error) {
			notice = { kind: "load-failed", message: errorMessage(error) };
		}
		const current = this.#state;
		if (current.key !== key) return;
		const meanwhile = current.roots.filter(hasBytes);
		const roots = stageRoots(loaded?.roots ?? [], meanwhile).roots;
		const changed = meanwhile.length > 0 || this.#settingsTouched;
		this.#set({
			key,
			status: "ready",
			roots,
			settings: this.#settingsTouched
				? current.settings
				: (loaded?.settings ?? DEFAULT_TRAY_SETTINGS),
			saved: !changed,
			notice,
		});
		if (changed) this.#persist();
	}

	/** Adds dropped or picked roots; `null` without a wallet. */
	stage(incoming: readonly LocalRoot[]): StagingResult | null {
		if (this.#state.key === null) return null;
		const result = stageRoots(this.#state.roots, incoming);
		this.#change({ roots: result.roots });
		return result;
	}

	remove(id: string): void {
		this.#change({
			roots: this.#state.roots.filter((root) => root.id !== id),
		});
	}

	/** Empties the tray and keeps its settings: after Clear, and once it is sent. */
	clear(): void {
		this.#change({ roots: [] });
	}

	update(change: Partial<TraySettings>): void {
		this.#settingsTouched = true;
		this.#change({ settings: { ...this.#state.settings, ...change } });
	}

	/** Resolves once every change made so far is saved, or failed to save. */
	flush(): Promise<void> {
		return this.#saving;
	}

	#set(next: TrayState): void {
		this.#state = next;
		for (const listener of this.#listeners) listener();
	}

	#change(patch: Partial<Pick<TrayState, "roots" | "settings">>): void {
		if (this.#state.key === null) return;
		this.#set({ ...this.#state, ...patch, saved: false });
		this.#persist();
	}

	/** Queues a save of the tray as it is now; one queued save per key takes the newest. */
	#persist(): void {
		const { key, status, roots, settings } = this.#state;
		// While loading, the merge with the saved tray persists instead.
		if (key === null || status !== "ready") return;
		const queued = this.#unsaved.has(key);
		this.#unsaved.set(key, { roots, settings });
		if (!queued) this.#saving = this.#saving.then(() => this.#save(key));
	}

	/** Never rejects: a failed save becomes the tray's notice. */
	async #save(key: string): Promise<void> {
		const tray = this.#unsaved.get(key);
		if (!tray) return;
		this.#unsaved.delete(key);
		let notice: TrayNotice | null = this.#durable
			? null
			: { kind: "memory-only" };
		try {
			const result = await this.#store.save(key, tray);
			if (result.kind === "list-only")
				notice = { kind: "list-only", reason: result.reason };
		} catch (error) {
			notice = { kind: "save-failed", message: errorMessage(error) };
		}
		const current = this.#state;
		if (current.key !== key) return;
		this.#set({
			...current,
			saved: !this.#unsaved.has(key) && notice?.kind !== "save-failed",
			notice,
		});
	}
}
