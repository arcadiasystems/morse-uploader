import { browserStorage } from "@/lib/browser-storage";
import { createPersistedStore } from "@/lib/create-persisted-store";
import { isNetworkId } from "./is-network-id";
import { DEFAULT_NETWORK, type NetworkId } from "./networks";

/** The last network the viewer picked, restored on reload. */
export const networkStore = createPersistedStore<NetworkId>({
	key: "morse-uploader:network",
	fallback: DEFAULT_NETWORK,
	parse: (raw) => (isNetworkId(raw) ? raw : null),
	serialize: (network) => network,
	storage: browserStorage(),
});
