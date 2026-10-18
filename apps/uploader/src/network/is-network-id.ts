import { NETWORK_IDS, type NetworkId } from "./networks";

export function isNetworkId(value: unknown): value is NetworkId {
	return (
		typeof value === "string" &&
		(NETWORK_IDS as readonly string[]).includes(value)
	);
}
