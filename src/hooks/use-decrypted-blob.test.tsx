import type {
	MorsePackageConfig,
	SealAdapter,
	WalrusReadAdapter,
	WalrusWriteAdapter,
} from "@arcadiasystems/morse-sdk";
import type { SealCompatibleClient } from "@mysten/seal";
import type { Signer } from "@mysten/sui/cryptography";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MorseUploaderProvider } from "../context/morse-uploader-provider.js";
import type { DecryptInput, MorseUploaderContextValue } from "../types.js";
import { useDecryptedBlob } from "./use-decrypted-blob.js";

vi.mock("../core/decrypt-file.js", () => ({ decryptFile: vi.fn() }));

import { decryptFile } from "../core/decrypt-file.js";

const plaintext = new Uint8Array([7, 7]);

const input = {
	blobRef: { kind: "blob", blobObjectId: "0xb" },
	sealId: "seal-1",
} as unknown as DecryptInput;

function makeValue(complete: boolean): MorseUploaderContextValue {
	const base = {
		config: { packageId: "0xpkg" } as unknown as MorsePackageConfig,
		walrus: {} as unknown as WalrusWriteAdapter,
		seal: {} as unknown as SealAdapter,
		walrusRead: {} as unknown as WalrusReadAdapter,
		client: {} as unknown as SealCompatibleClient,
		address: "0xowner",
		target: {
			publicationId: "0xpub",
			publisherCapId: "0xcap",
			collectionName: "files",
		},
	};
	// Omit the signer to model an incomplete context.
	return (
		complete ? { ...base, signer: {} as unknown as Signer } : base
	) as MorseUploaderContextValue;
}

function wrapperFor(value: MorseUploaderContextValue) {
	return ({ children }: { children: ReactNode }) => (
		<MorseUploaderProvider value={value}>{children}</MorseUploaderProvider>
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("useDecryptedBlob", () => {
	it("decrypts and exposes the plaintext", async () => {
		vi.mocked(decryptFile).mockResolvedValue(plaintext);
		const { result } = renderHook(() => useDecryptedBlob(), {
			wrapper: wrapperFor(makeValue(true)),
		});

		await act(async () => {
			await result.current.decrypt(input);
		});

		expect(result.current.status).toBe("success");
		expect(result.current.data).toBe(plaintext);
		expect(decryptFile).toHaveBeenCalledWith(
			expect.objectContaining({ createSessionKey: expect.any(Function) }),
			expect.objectContaining({ sealId: "seal-1", publisherCapId: "0xcap" }),
		);
	});

	it("records an error when decryption fails", async () => {
		vi.mocked(decryptFile).mockRejectedValue(new Error("denied"));
		const { result } = renderHook(() => useDecryptedBlob(), {
			wrapper: wrapperFor(makeValue(true)),
		});

		await act(async () => {
			await expect(result.current.decrypt(input)).rejects.toThrow("denied");
		});
		expect(result.current.status).toBe("error");
		expect(result.current.data).toBeNull();
	});

	it("rejects when the context is missing decrypt deps", async () => {
		const { result } = renderHook(() => useDecryptedBlob(), {
			wrapper: wrapperFor(makeValue(false)),
		});
		await expect(result.current.decrypt(input)).rejects.toThrow(
			/requires seal, walrusRead, signer/,
		);
	});
});
