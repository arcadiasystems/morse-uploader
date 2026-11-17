import { describe, expect, it } from "vitest";
import { NETWORKS, type NetworkConfig } from "@/network/networks";
import type { SealSettings } from "@/upload/upload-plan";
import {
	encryptionAvailability,
	NO_KEY_SERVERS_REASON,
} from "./encryption-availability";

const SEAL: SealSettings = {
	envelope: { keyServers: 2, identityBytes: 49 },
	policyPackageId:
		"0x191946c5dc1ea1b978e664d85455e81ef9bdd1d3dbb221fd48cf9008d46a00f0",
};

describe("encryptionAvailability", () => {
	it("is available on Testnet once its key servers are read", () => {
		expect(encryptionAvailability(NETWORKS.testnet, SEAL)).toEqual({
			kind: "available",
			seal: SEAL,
		});
	});

	it("waits while Testnet's Seal settings are not read yet", () => {
		expect(encryptionAvailability(NETWORKS.testnet, undefined)).toEqual({
			kind: "reading",
		});
	});

	it("is unavailable on Walrus Mainnet, with the network's own reason", () => {
		const mainnet = NETWORKS.mainnet;
		if (mainnet.seal.kind !== "unavailable")
			throw new Error("Walrus Mainnet is expected to offer no Seal.");
		for (const seal of [undefined, null, SEAL])
			expect(encryptionAvailability(mainnet, seal)).toEqual({
				kind: "unavailable",
				reason: mainnet.seal.reason,
			});
		expect(mainnet.seal.reason).toContain("Walrus Mainnet");
	});

	it("is unavailable when a network that offers Seal has no key server", () => {
		const none: SealSettings = {
			...SEAL,
			envelope: { ...SEAL.envelope, keyServers: 0 },
		};
		for (const seal of [null, none])
			expect(encryptionAvailability(NETWORKS.testnet, seal)).toEqual({
				kind: "unavailable",
				reason: NO_KEY_SERVERS_REASON,
			});
	});

	it("follows the network's setting, not its name", () => {
		const closed: NetworkConfig = {
			...NETWORKS.testnet,
			seal: { kind: "unavailable", reason: "Closed for the test." },
		};
		expect(encryptionAvailability(closed, SEAL)).toEqual({
			kind: "unavailable",
			reason: "Closed for the test.",
		});
	});
});
