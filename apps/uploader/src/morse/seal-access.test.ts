import {
	buildRecipientFileSealId,
	SealPolicyTag,
} from "@arcadiasystems/morse-sdk";
import { EncryptedObject } from "@mysten/seal";
import { toHex } from "@mysten/sui/utils";
import { describe, expect, it, vi } from "vitest";
import {
	type OpenBlobSteps,
	openBlob,
	SealAccessError,
	type SealAccessRefusal,
} from "./seal-access";

const PREFIX = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const NONCE = Uint8Array.from({ length: 16 }, (_, index) => 0xa0 + index);
const PLAINTEXT = new TextEncoder().encode("Sealed on Testnet for one epoch.");
/** A file uploaded as it is, without Seal. */
const PLAIN_FILE = new TextEncoder().encode(
	"A public note on Testnet, stored as plain bytes for anyone to read.\n",
);

/** Seal ciphertext carrying `identity`, in the layout `SealClient.encrypt` writes, serialized by Seal's own BCS. */
function sealCiphertext(identity: Uint8Array): Uint8Array {
	return EncryptedObject.serialize({
		version: 0,
		packageId: `0x${"1".repeat(64)}`,
		id: toHex(identity),
		services: [[`0x${"2".repeat(64)}`, 0]],
		threshold: 1,
		encryptedShares: {
			BonehFranklinBLS12381: {
				nonce: new Uint8Array(96),
				encryptedShares: [new Uint8Array(32)],
				encryptedRandomness: new Uint8Array(32),
			},
		},
		ciphertext: {
			Aes256Gcm: { blob: new Uint8Array(PLAINTEXT.length + 16), aad: [] },
		},
	}).toBytes();
}

/** The chain and aggregator reads answering with `prefix` and `bytes`, and a decrypt that returns the plaintext. */
function steps(prefix: Uint8Array | null, bytes: Uint8Array) {
	return {
		readPrefix: vi.fn(async () => prefix),
		readBytes: vi.fn(async () => bytes),
		signAndDecrypt: vi.fn<OpenBlobSteps["signAndDecrypt"]>(
			async () => PLAINTEXT,
		),
	};
}

/** Why `openBlob` refused; any other outcome fails the test. */
async function refusalOf(
	opening: Promise<unknown>,
): Promise<SealAccessRefusal> {
	try {
		await opening;
	} catch (error) {
		if (error instanceof SealAccessError) return error.reason;
		throw error;
	}
	throw new Error("openBlob opened a blob the rule refuses.");
}

describe("openBlob", () => {
	it("decrypts ciphertext whose Seal identity is under the RecipientFile's prefix", async () => {
		const identity = buildRecipientFileSealId(PREFIX, NONCE);
		const ciphertext = sealCiphertext(identity);
		const reads = steps(PREFIX, ciphertext);

		expect(await openBlob(reads)).toEqual({
			kind: "decrypted",
			bytes: PLAINTEXT,
		});
		expect(reads.signAndDecrypt).toHaveBeenCalledTimes(1);
		expect(reads.signAndDecrypt).toHaveBeenCalledWith(ciphertext, identity);
	});

	it("refuses a prefixed file whose blob is not Seal ciphertext, with nothing signed", async () => {
		const reads = steps(PREFIX, PLAIN_FILE);

		expect(await refusalOf(openBlob(reads))).toBe("missing");
		expect(reads.signAndDecrypt).not.toHaveBeenCalled();
	});

	it.each([
		[
			"another prefix",
			buildRecipientFileSealId(
				PREFIX.map((byte) => byte ^ 0xff),
				NONCE,
			),
		],
		[
			"another policy tag",
			Uint8Array.from([...PREFIX, SealPolicyTag.Publisher, ...NONCE]),
		],
		["no nonce", Uint8Array.from([...PREFIX, SealPolicyTag.RecipientFile])],
		["only part of the prefix", PREFIX.slice(0, 16)],
	])("refuses an identity with %s before any signature", async (_, identity) => {
		const reads = steps(PREFIX, sealCiphertext(identity));

		expect(await refusalOf(openBlob(reads))).toBe("mismatch");
		expect(reads.signAndDecrypt).not.toHaveBeenCalled();
	});

	it("opens a file with no prefix and plain bytes as public, with nothing signed", async () => {
		const reads = steps(null, PLAIN_FILE);

		expect(await openBlob(reads)).toEqual({
			kind: "public",
			bytes: PLAIN_FILE,
		});
		expect(reads.signAndDecrypt).not.toHaveBeenCalled();
	});

	it("refuses Seal ciphertext whose RecipientFile has no prefix as an older format", async () => {
		const ciphertext = sealCiphertext(buildRecipientFileSealId(PREFIX, NONCE));
		const reads = steps(null, ciphertext);

		expect(await refusalOf(openBlob(reads))).toBe("older-format");
		expect(reads.signAndDecrypt).not.toHaveBeenCalled();
	});

	it("reads the prefix and the bytes before it asks for a signature", async () => {
		const ciphertext = sealCiphertext(buildRecipientFileSealId(PREFIX, NONCE));
		const order: string[] = [];
		const later = () => new Promise((resolve) => setTimeout(resolve, 0));

		await openBlob({
			readPrefix: async () => {
				await later();
				order.push("prefix read");
				return PREFIX;
			},
			readBytes: async () => {
				await later();
				order.push("bytes read");
				return ciphertext;
			},
			signAndDecrypt: async () => {
				order.push("signature asked");
				return PLAINTEXT;
			},
		});
		expect(order).toEqual(["prefix read", "bytes read", "signature asked"]);
	});
});

describe("SealAccessError", () => {
	it("says why for each refusal, and that nothing was signed or saved", () => {
		const reasons: SealAccessRefusal[] = [
			"missing",
			"mismatch",
			"older-format",
		];
		const messages = reasons.map(
			(reason) => new SealAccessError(reason).message,
		);

		expect(new Set(messages).size).toBe(reasons.length);
		for (const message of messages)
			expect(message).toMatch(/ Nothing was signed or saved\.$/);
		expect(new SealAccessError("older-format").message).toMatch(
			/^This file uses an older encryption format that Morse Uploader can't open yet\./,
		);
	});
});
