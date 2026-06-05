import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MorseFilesProvider } from "./morse-files-provider.js";
import type { FileDecryptInput, MorseFilesHandles } from "./types.js";
import { useFileDecrypt } from "./use-file-decrypt.js";

vi.mock("@mysten/seal", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mysten/seal")>();
	return {
		...actual,
		SessionKey: { create: vi.fn().mockResolvedValue({ id: "session" }) },
	};
});

const plaintext = new Uint8Array([7, 7]);

function makeHandles(decrypt: ReturnType<typeof vi.fn>): MorseFilesHandles {
	return {
		seal: { decryptUnderRecipientFile: decrypt },
		walrusRead: { readBlob: vi.fn().mockResolvedValue(new Uint8Array([9])) },
		signer: {},
		client: {},
		config: { packageId: "0xpkg" },
		address: "0xme",
	} as unknown as MorseFilesHandles;
}
function wrap(handles: MorseFilesHandles) {
	return ({ children }: { children: ReactNode }) => (
		<MorseFilesProvider value={handles}>{children}</MorseFilesProvider>
	);
}

const input = {
	file: { id: "0xfile", blobId: "blob" },
	sealIdPrefix: new Uint8Array([1, 2, 3]),
	sealNonce: new Uint8Array([4, 5]),
} as unknown as FileDecryptInput;

beforeEach(() => {
	vi.clearAllMocks();
});

describe("useFileDecrypt", () => {
	it("reads the blob, creates a session, and decrypts under the file", async () => {
		const decrypt = vi.fn().mockResolvedValue(plaintext);
		const { result } = renderHook(() => useFileDecrypt(), {
			wrapper: wrap(makeHandles(decrypt)),
		});
		await act(async () => {
			await result.current.decrypt(input);
		});
		expect(result.current.status).toBe("success");
		expect(result.current.data).toBe(plaintext);
		expect(decrypt).toHaveBeenCalledWith(
			new Uint8Array([9]),
			expect.objectContaining({ fileId: "0xfile" }),
		);
	});

	it("records an error when decryption fails", async () => {
		const decrypt = vi.fn().mockRejectedValue(new Error("nope"));
		const { result } = renderHook(() => useFileDecrypt(), {
			wrapper: wrap(makeHandles(decrypt)),
		});
		await act(async () => {
			await expect(result.current.decrypt(input)).rejects.toThrow("nope");
		});
		expect(result.current.status).toBe("error");
	});
});
