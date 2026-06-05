import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MorseFilesProvider } from "./morse-files-provider.js";
import type { MorseFilesHandles } from "./types.js";
import { useFileUpload } from "./use-file-upload.js";

vi.mock("@arcadiasystems/morse-sdk", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@arcadiasystems/morse-sdk")>();
	return {
		...actual,
		uploadEncryptedRecipientFileFromBytes: vi.fn(),
		uploadRecipientFileFromBytes: vi.fn(),
	};
});

import {
	uploadEncryptedRecipientFileFromBytes,
	uploadRecipientFileFromBytes,
} from "@arcadiasystems/morse-sdk";

const handles = {
	adapter: {},
	config: {},
	walrusWrite: {},
	seal: {},
} as unknown as MorseFilesHandles;

const wrapper = ({ children }: { children: ReactNode }) => (
	<MorseFilesProvider value={handles}>{children}</MorseFilesProvider>
);

function makeFile(): File {
	return {
		name: "r.pdf",
		type: "application/pdf",
		arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
	} as unknown as File;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("useFileUpload", () => {
	it("encrypts for recipients and returns seal material + share link", async () => {
		const sealIdPrefix = new Uint8Array([7, 7]);
		const sealNonce = new Uint8Array([9]);
		vi.mocked(uploadEncryptedRecipientFileFromBytes).mockResolvedValue({
			fileId: "0xfile",
			blobId: "blobABC",
			blobObjectId: "0xobj",
			sealIdPrefix,
			sealNonce,
		} as unknown as Awaited<
			ReturnType<typeof uploadEncryptedRecipientFileFromBytes>
		>);

		const { result } = renderHook(() => useFileUpload(), { wrapper });
		await act(async () => {
			await result.current.upload({
				file: makeFile(),
				recipients: ["0xbob" as never],
				encrypt: true,
				epochs: 2,
			});
		});

		expect(result.current.status).toBe("success");
		expect(result.current.data?.encrypted).toBe(true);
		expect(result.current.data?.sealIdPrefix).toEqual(sealIdPrefix);
		expect(result.current.data?.sealNonce).toEqual(sealNonce);
		expect(result.current.data?.shareLink).toContain("0xfile");
		expect(uploadRecipientFileFromBytes).not.toHaveBeenCalled();
	});

	it("uploads a public file when encrypt is not set", async () => {
		vi.mocked(uploadRecipientFileFromBytes).mockResolvedValue({
			fileId: "0xpub",
			blobId: "blobPUB",
			blobObjectId: "0xo",
		} as unknown as Awaited<ReturnType<typeof uploadRecipientFileFromBytes>>);

		const { result } = renderHook(() => useFileUpload(), { wrapper });
		await act(async () => {
			await result.current.upload({ file: makeFile(), epochs: 2 });
		});

		expect(result.current.data?.encrypted).toBe(false);
		expect(result.current.data?.sealIdPrefix).toBeNull();
		expect(uploadEncryptedRecipientFileFromBytes).not.toHaveBeenCalled();
	});

	it("records an error when the upload fails", async () => {
		vi.mocked(uploadRecipientFileFromBytes).mockRejectedValue(
			new Error("boom"),
		);
		const { result } = renderHook(() => useFileUpload(), { wrapper });
		await act(async () => {
			await expect(
				result.current.upload({ file: makeFile(), epochs: 2 }),
			).rejects.toThrow("boom");
		});
		expect(result.current.status).toBe("error");
	});
});
