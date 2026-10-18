import { isPeriodId, type PeriodId } from "@/upload/periods";
import type { UploadMode } from "@/upload/upload-plan";

/** How long staged files are kept on Walrus: a period, or exact epochs. */
export type KeepChoice =
	| { kind: "period"; id: PeriodId }
	| { kind: "epochs"; epochs: number };

/**
 * The tray's four settings (handover item 2): keep for (with deletable),
 * encryption, folder handling and also publish. Saved with the tray.
 */
export interface TraySettings {
	/** `null` keeps the network's first period that fits. */
	keep: KeepChoice | null;
	/** Morse only takes deletable blobs; off keeps them for the whole period. */
	deletable: boolean;
	/** Seal encryption, where the network offers it (Testnet). */
	encrypt: boolean;
	mode: UploadMode;
	publish: boolean;
	/** The chosen publication and collection (`choiceKey`); `null` takes the first. */
	publishTo: string | null;
}

export const DEFAULT_TRAY_SETTINGS: TraySettings = {
	keep: null,
	deletable: true,
	encrypt: false,
	mode: "quilt",
	publish: false,
	publishTo: null,
};

/**
 * Settings read back from storage, field by field: anything missing or
 * not valid takes the default, so an older or damaged record never breaks
 * the tray.
 */
export function parseTraySettings(value: unknown): TraySettings {
	if (typeof value !== "object" || value === null) return DEFAULT_TRAY_SETTINGS;
	const record = value as Record<string, unknown>;
	const flag = (key: keyof TraySettings, fallback: boolean): boolean => {
		const stored = record[key];
		return typeof stored === "boolean" ? stored : fallback;
	};
	return {
		keep: parseKeep(record.keep),
		deletable: flag("deletable", DEFAULT_TRAY_SETTINGS.deletable),
		encrypt: flag("encrypt", DEFAULT_TRAY_SETTINGS.encrypt),
		mode:
			record.mode === "quilt" || record.mode === "per-file"
				? record.mode
				: DEFAULT_TRAY_SETTINGS.mode,
		publish: flag("publish", DEFAULT_TRAY_SETTINGS.publish),
		publishTo: typeof record.publishTo === "string" ? record.publishTo : null,
	};
}

function parseKeep(value: unknown): KeepChoice | null {
	if (typeof value !== "object" || value === null) return null;
	const keep = value as Record<string, unknown>;
	if (keep.kind === "period" && isPeriodId(keep.id))
		return { kind: "period", id: keep.id };
	if (
		keep.kind === "epochs" &&
		typeof keep.epochs === "number" &&
		Number.isInteger(keep.epochs) &&
		keep.epochs >= 1
	)
		return { kind: "epochs", epochs: keep.epochs };
	return null;
}
