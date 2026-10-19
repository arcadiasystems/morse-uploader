import { normalizeSuiAddress } from "@mysten/sui/utils";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { NetworkId } from "@/network/networks";
import { StagingTrayModel, type TrayState } from "./staging-tray";
import { createTrayStore, trayKey } from "./tray-store";

export interface StagingTray {
	model: StagingTrayModel;
	state: TrayState;
}

/**
 * The app's staging tray, for the connected wallet on the current network:
 * the saved tray comes back when the wallet connects or the network
 * changes, and every change is saved in IndexedDB.
 */
export function useStagingTray(
	network: NetworkId,
	address: string | null,
): StagingTray {
	const [model] = useState(() => new StagingTrayModel(createTrayStore()));
	const state = useSyncExternalStore(
		model.subscribe,
		model.getState,
		model.getState,
	);
	const key =
		address === null ? null : trayKey(network, normalizeSuiAddress(address));
	useEffect(() => {
		// `open` reports its own failures in the tray's notice; it never rejects.
		void model.open(key);
	}, [model, key]);
	return { model, state };
}
