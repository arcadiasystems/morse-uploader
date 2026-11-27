import type { NetworkConfig } from "@/network/networks";
import type { SealSettings } from "@/upload/upload-plan";

/**
 * Whether the staging tray can Seal-encrypt right now. `reading` is a
 * network that offers Seal whose settings are not read yet: the switch
 * waits, and nothing is planned as encrypted until they are.
 */
export type EncryptionAvailability =
	| { kind: "available"; seal: SealSettings }
	| { kind: "reading" }
	| { kind: "unavailable"; reason: string };

/** Shown when a network offers Seal but morse-sdk names no key server to encrypt to. */
export const NO_KEY_SERVERS_REASON =
	"No Seal key server is configured for this network, so there is no key to encrypt to.";

/**
 * The one rule for the Encrypt switch and for planning an upload as
 * encrypted. Encryption needs a network that offers Seal without a
 * credential (`network.seal`; Walrus Mainnet does not) and at least one
 * key server in the settings read for it.
 *
 * @param seal The network's Seal settings: `undefined` until they are read,
 * `null` when the network has none.
 */
export function encryptionAvailability(
	network: NetworkConfig,
	seal: SealSettings | null | undefined,
): EncryptionAvailability {
	if (network.seal.kind === "unavailable")
		return { kind: "unavailable", reason: network.seal.reason };
	if (seal === undefined) return { kind: "reading" };
	if (seal === null || seal.envelope.keyServers === 0)
		return { kind: "unavailable", reason: NO_KEY_SERVERS_REASON };
	return { kind: "available", seal };
}
