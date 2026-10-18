import type { NetworkConfig } from "./networks";

/** A Sui object on the network's explorer. */
export function explorerObjectUrl(
	network: Pick<NetworkConfig, "explorerUrl">,
	objectId: string,
): string {
	return `${network.explorerUrl}/object/${objectId}`;
}

/** A transaction on the network's explorer. */
export function explorerTxUrl(
	network: Pick<NetworkConfig, "explorerUrl">,
	digest: string,
): string {
	return `${network.explorerUrl}/tx/${digest}`;
}
