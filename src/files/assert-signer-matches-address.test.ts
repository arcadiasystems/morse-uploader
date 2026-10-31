import { UserError } from "@mysten/seal";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { describe, expect, it } from "vitest";
import { assertSignerMatchesAddress } from "./assert-signer-matches-address.js";

const alice = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(1));
const bob = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(2));

describe("assertSignerMatchesAddress", () => {
	it("accepts the signer's own address", () => {
		expect(() =>
			assertSignerMatchesAddress(alice, alice.toSuiAddress()),
		).not.toThrow();
	});

	it("compares normalized addresses, so case does not matter", () => {
		const upper = `0x${alice.toSuiAddress().slice(2).toUpperCase()}`;
		expect(() => assertSignerMatchesAddress(alice, upper)).not.toThrow();
	});

	it("rejects a signer for another account with Seal's error class", () => {
		const attempt = () => assertSignerMatchesAddress(bob, alice.toSuiAddress());
		expect(attempt).toThrow(UserError);
		expect(attempt).toThrow(
			/^Signer address does not match session key address/,
		);
		expect(attempt).toThrow(bob.toSuiAddress());
	});
});
