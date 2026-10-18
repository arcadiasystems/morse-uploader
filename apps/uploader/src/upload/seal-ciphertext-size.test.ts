import { EncryptedObject } from "@mysten/seal";
import { describe, expect, it } from "vitest";
import { sealCiphertextSize } from "./seal-ciphertext-size";

const TESTNET = { keyServers: 2, identityBytes: 49 };

/** An EncryptedObject with the shape `SealClient.encrypt` produces, serialized by Seal's own BCS. */
function serializedSize(
	plaintextBytes: number,
	keyServers: number,
	identityBytes: number,
): number {
	return EncryptedObject.serialize({
		version: 0,
		packageId: `0x${"1".repeat(64)}`,
		id: "ab".repeat(identityBytes),
		services: Array.from({ length: keyServers }, (_, index) => [
			`0x${String(index).repeat(64)}`,
			index,
		]),
		threshold: keyServers,
		encryptedShares: {
			BonehFranklinBLS12381: {
				nonce: new Uint8Array(96),
				encryptedShares: Array.from(
					{ length: keyServers },
					() => new Uint8Array(32),
				),
				encryptedRandomness: new Uint8Array(32),
			},
		},
		ciphertext: {
			Aes256Gcm: { blob: new Uint8Array(plaintextBytes + 16), aad: [] },
		},
	}).toBytes().length;
}

describe("sealCiphertextSize", () => {
	it("matches the 375 bytes Seal produced for a 10-byte file on Testnet (2026-10-18)", () => {
		expect(sealCiphertextSize(10, TESTNET)).toBe(375);
	});

	it.each([
		0, 10, 111, 112, 20_000, 1_200_000,
	])("matches Seal's EncryptedObject layout for %d bytes", (bytes) => {
		expect(sealCiphertextSize(bytes, TESTNET)).toBe(
			serializedSize(bytes, 2, 49),
		);
		expect(
			sealCiphertextSize(bytes, { keyServers: 3, identityBytes: 200 }),
		).toBe(serializedSize(bytes, 3, 200));
	});
});
