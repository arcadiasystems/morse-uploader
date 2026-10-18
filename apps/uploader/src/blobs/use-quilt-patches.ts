import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useSyncExternalStore } from "react";
import type { NetworkClient } from "@/network/create-network-client";
import {
	createQuiltPatchStore,
	type QuiltPatches,
	type QuiltPatchStore,
} from "./quilt-patch-store";
import { createSdkQuiltIndexReader } from "./read-quilt-index";

/** One store per network client, so reads survive switching networks and back. */
const stores = new WeakMap<NetworkClient, QuiltPatchStore>();

function storeFor(client: NetworkClient): QuiltPatchStore {
	let store = stores.get(client);
	if (!store) {
		store = createQuiltPatchStore(createSdkQuiltIndexReader(client));
		stores.set(client, store);
	}
	return store;
}

/** Quilt patch reads on the current network, by quilt blob id. */
export function useQuiltPatches(): {
	store: QuiltPatchStore;
	patches: ReadonlyMap<string, QuiltPatches>;
} {
	const store = storeFor(useCurrentClient());
	const patches = useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot,
	);
	return { store, patches };
}
