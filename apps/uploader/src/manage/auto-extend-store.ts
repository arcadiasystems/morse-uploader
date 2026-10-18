import { useSyncExternalStore } from "react";
import { browserStorage } from "@/lib/browser-storage";
import {
	createPersistedStore,
	type PersistedStore,
} from "@/lib/create-persisted-store";
import type { NetworkId } from "@/network/networks";
import {
	type AutoExtendSettings,
	DEFAULT_AUTO_EXTEND,
	parseAutoExtend,
	serializeAutoExtend,
} from "./auto-extend";

/**
 * Auto-extend settings per profile, an address on a network, kept in this
 * browser's localStorage. A blocked or full storage keeps them in memory
 * for the session (`createPersistedStore` guards every access).
 */
const stores = new Map<string, PersistedStore<AutoExtendSettings>>();

export function autoExtendStore(
	network: NetworkId,
	address: string,
): PersistedStore<AutoExtendSettings> {
	const key = `morse-uploader:auto-extend:${network}:${address}`;
	let store = stores.get(key);
	if (!store) {
		store = createPersistedStore({
			key,
			fallback: DEFAULT_AUTO_EXTEND,
			parse: parseAutoExtend,
			serialize: serializeAutoExtend,
			storage: browserStorage(),
		});
		stores.set(key, store);
	}
	return store;
}

const noSubscription = () => () => undefined;
const defaults = () => DEFAULT_AUTO_EXTEND;

/**
 * The profile's settings, read with useSyncExternalStore so other tabs stay
 * in step; the defaults while no profile is active (`store` is `null`).
 */
export function useAutoExtendSettings(
	store: PersistedStore<AutoExtendSettings> | null,
): AutoExtendSettings {
	return useSyncExternalStore(
		store?.subscribe ?? noSubscription,
		store?.get ?? defaults,
		store?.get ?? defaults,
	);
}
