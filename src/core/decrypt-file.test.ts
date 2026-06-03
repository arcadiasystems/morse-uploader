import { SealError } from "@arcadiasystems/morse-sdk";
import { describe, expect, it, vi } from "vitest";
import type { DecryptFileArgs, DecryptFileDeps } from "../types.js";
import { decryptFile } from "./decrypt-file.js";

const plaintext = new Uint8Array([7, 7, 7]);
const ciphertext = new Uint8Array([1, 2, 3]);

const args = {
	blobRef: { kind: "blob", blobObjectId: "0xb" },
	sealId: "seal-1",
	publisherCapId: "0xcap",
} as unknown as DecryptFileArgs;

function makeDeps(
	decryptImpl: (...calls: unknown[]) => Promise<Uint8Array>,
): DecryptFileDeps {
	return {
		seal: { encrypt: vi.fn(), decrypt: vi.fn(decryptImpl) },
		walrusRead: {
			readBlobRef: vi.fn().mockResolvedValue(ciphertext),
			readBlob: vi.fn(),
			readBlobByObjectId: vi.fn(),
			readQuiltPatch: vi.fn(),
		},
		createSessionKey: vi.fn().mockResolvedValue({}),
	} as unknown as DecryptFileDeps;
}

describe("decryptFile", () => {
	it("reads the ciphertext and decrypts", async () => {
		const deps = makeDeps(() => Promise.resolve(plaintext));
		const result = await decryptFile(deps, args);
		expect(result).toBe(plaintext);
		expect(deps.walrusRead.readBlobRef).toHaveBeenCalledWith(
			args.blobRef,
			undefined,
		);
		expect(deps.createSessionKey).toHaveBeenCalledTimes(1);
		expect(deps.seal.decrypt).toHaveBeenCalledWith(
			ciphertext,
			expect.objectContaining({ sealId: "seal-1", publisherCapId: "0xcap" }),
		);
	});

	it("re-signs once and retries on session-expired", async () => {
		const decrypt = vi
			.fn()
			.mockRejectedValueOnce(new SealError("session-expired", "expired"))
			.mockResolvedValueOnce(plaintext);
		const deps = {
			seal: { encrypt: vi.fn(), decrypt },
			walrusRead: { readBlobRef: vi.fn().mockResolvedValue(ciphertext) },
			createSessionKey: vi.fn().mockResolvedValue({}),
		} as unknown as DecryptFileDeps;

		const result = await decryptFile(deps, args);
		expect(result).toBe(plaintext);
		expect(deps.createSessionKey).toHaveBeenCalledTimes(2);
		expect(decrypt).toHaveBeenCalledTimes(2);
	});

	it("propagates a non-session-expired SealError without retrying", async () => {
		const deps = makeDeps(() =>
			Promise.reject(new SealError("no-access", "denied")),
		);
		await expect(decryptFile(deps, args)).rejects.toThrow(SealError);
		expect(deps.createSessionKey).toHaveBeenCalledTimes(1);
	});

	it("forwards the abort signal to the read", async () => {
		const deps = makeDeps(() => Promise.resolve(plaintext));
		const { signal } = new AbortController();
		await decryptFile(deps, { ...args, signal });
		expect(deps.walrusRead.readBlobRef).toHaveBeenCalledWith(args.blobRef, {
			signal,
		});
	});
});
