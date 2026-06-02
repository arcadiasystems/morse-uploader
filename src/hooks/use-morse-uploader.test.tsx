import type {
	MorsePackageConfig,
	WalletAdapter,
	WalrusWriteAdapter,
} from "@arcadiasystems/morse-sdk";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MorseUploaderProvider } from "../context/morse-uploader-provider.js";
import type {
	MorseUploaderContextValue,
	MorseUploaderTarget,
	UploadFileResult,
} from "../types.js";
import { useMorseUploader } from "./use-morse-uploader.js";

// Mock the upload core so the hook is tested in isolation from the SDK.
vi.mock("../core/upload-file.js", () => ({ uploadFile: vi.fn() }));

import { uploadFile } from "../core/upload-file.js";

const value = {
	config: {} as unknown as MorsePackageConfig,
	walrus: {} as unknown as WalrusWriteAdapter,
	shareUrl: { appBaseUrl: "https://app.test" },
} as MorseUploaderContextValue;

const wrapper = ({ children }: { children: ReactNode }) => (
	<MorseUploaderProvider value={value}>{children}</MorseUploaderProvider>
);

// Minimal File stand-in: jsdom's File does not implement arrayBuffer(), and the
// hook only needs name, type, and arrayBuffer().
function makeFile(): File {
	return {
		name: "report.pdf",
		type: "application/pdf",
		arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
	} as unknown as File;
}

const blobResult = {
	mode: "blob",
	blobId: "blobABC",
	blobObjectId: "0xobj",
} as unknown as UploadFileResult;

beforeEach(() => {
	vi.clearAllMocks();
});

describe("useMorseUploader", () => {
	it("uploads, tracks progress, and computes a share URL", async () => {
		vi.mocked(uploadFile).mockImplementation(async (_deps, args) => {
			args.onProgress?.({ phase: "uploading" });
			args.onProgress?.({ phase: "complete" });
			return blobResult;
		});

		const { result } = renderHook(() => useMorseUploader(), { wrapper });
		await act(async () => {
			await result.current.upload({ file: makeFile() });
		});

		expect(result.current.status).toBe("success");
		expect(result.current.phase).toBe("complete");
		expect(result.current.data).toEqual({
			result: blobResult,
			shareUrl: "https://app.test/f/blobABC",
		});
		expect(uploadFile).toHaveBeenCalledWith(
			expect.objectContaining({ config: value.config, walrus: value.walrus }),
			expect.objectContaining({
				name: "report.pdf",
				contentType: "application/pdf",
				epochs: 12,
			}),
		);
	});

	it("uses per-call epochs and target overrides", async () => {
		vi.mocked(uploadFile).mockResolvedValue(blobResult);
		const target = {
			publicationId: "0xpub",
			publisherCapId: "0xcap",
			collectionName: "files",
		} as unknown as MorseUploaderTarget;

		const { result } = renderHook(() => useMorseUploader(), { wrapper });
		await act(async () => {
			await result.current.upload({ file: makeFile(), epochs: 5, target });
		});

		expect(uploadFile).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ epochs: 5, target }),
		);
	});

	it("forwards adapter, deletable, and signal into uploadFile", async () => {
		vi.mocked(uploadFile).mockResolvedValue(blobResult);
		const adapter = {
			address: "0xabc",
			signAndExecuteTransaction: vi.fn(),
			simulateTransaction: vi.fn(),
		} as unknown as WalletAdapter;
		const valueWithAdapter = { ...value, adapter } as MorseUploaderContextValue;
		const adapterWrapper = ({ children }: { children: ReactNode }) => (
			<MorseUploaderProvider value={valueWithAdapter}>
				{children}
			</MorseUploaderProvider>
		);
		const { result } = renderHook(() => useMorseUploader(), {
			wrapper: adapterWrapper,
		});
		const { signal } = new AbortController();

		await act(async () => {
			await result.current.upload({
				file: makeFile(),
				deletable: false,
				signal,
			});
		});

		expect(uploadFile).toHaveBeenCalledWith(
			expect.objectContaining({ adapter }),
			expect.objectContaining({ deletable: false, signal }),
		);
	});

	it("records the error and rejects when the upload fails", async () => {
		vi.mocked(uploadFile).mockRejectedValue(new Error("boom"));
		const { result } = renderHook(() => useMorseUploader(), { wrapper });

		await act(async () => {
			await expect(result.current.upload({ file: makeFile() })).rejects.toThrow(
				"boom",
			);
		});

		expect(result.current.status).toBe("error");
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.data).toBeNull();
	});

	it("reset returns to idle", async () => {
		vi.mocked(uploadFile).mockResolvedValue(blobResult);
		const { result } = renderHook(() => useMorseUploader(), { wrapper });
		await act(async () => {
			await result.current.upload({ file: makeFile() });
		});
		expect(result.current.status).toBe("success");

		act(() => {
			result.current.reset();
		});
		expect(result.current.status).toBe("idle");
		expect(result.current.data).toBeNull();
		expect(result.current.phase).toBeNull();
	});
});
