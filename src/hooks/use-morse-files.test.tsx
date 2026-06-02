import type {
	MorsePackageConfig,
	PublicationReader,
	WalrusWriteAdapter,
} from "@arcadiasystems/morse-sdk";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MorseUploaderProvider } from "../context/morse-uploader-provider.js";
import type { MorseFile, MorseUploaderContextValue } from "../types.js";
import { useMorseFiles } from "./use-morse-files.js";

vi.mock("../core/list-user-files.js", () => ({ listUserFiles: vi.fn() }));

import { listUserFiles } from "../core/list-user-files.js";

const file = {
	publicationId: "0xpub",
	collectionName: "files",
	entryId: 1,
	name: "report.pdf",
	revisionId: 0,
	contentType: "application/pdf",
	encrypted: false,
	sealId: null,
	blobRef: { kind: "blob", blobObjectId: "0xb" },
} as unknown as MorseFile;

function makeValue(withReader: boolean): MorseUploaderContextValue {
	return {
		config: {} as unknown as MorsePackageConfig,
		walrus: {} as unknown as WalrusWriteAdapter,
		target: {
			publicationId: "0xpub",
			publisherCapId: "0xcap",
			collectionName: "files",
		},
		...(withReader ? { reader: {} as unknown as PublicationReader } : {}),
	} as MorseUploaderContextValue;
}

function wrapperFor(value: MorseUploaderContextValue) {
	return ({ children }: { children: ReactNode }) => (
		<MorseUploaderProvider value={value}>{children}</MorseUploaderProvider>
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("useMorseFiles", () => {
	it("loads files on mount using the target scope", async () => {
		vi.mocked(listUserFiles).mockResolvedValue([file]);
		const { result } = renderHook(() => useMorseFiles(), {
			wrapper: wrapperFor(makeValue(true)),
		});

		await waitFor(() => expect(result.current.status).toBe("success"));
		expect(result.current.files).toEqual([file]);
		expect(listUserFiles).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				publicationId: "0xpub",
				collectionName: "files",
			}),
		);
	});

	it("refresh reloads the files", async () => {
		vi.mocked(listUserFiles).mockResolvedValue([file]);
		const { result } = renderHook(() => useMorseFiles(), {
			wrapper: wrapperFor(makeValue(true)),
		});
		await waitFor(() => expect(result.current.status).toBe("success"));

		vi.mocked(listUserFiles).mockResolvedValue([]);
		await act(async () => {
			await result.current.refresh();
		});
		expect(result.current.files).toEqual([]);
	});

	it("sets error status when listing fails", async () => {
		vi.mocked(listUserFiles).mockRejectedValue(new Error("rpc down"));
		const { result } = renderHook(() => useMorseFiles(), {
			wrapper: wrapperFor(makeValue(true)),
		});
		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(result.current.error).toBeInstanceOf(Error);
	});

	it("lists by address when no target is set", async () => {
		vi.mocked(listUserFiles).mockResolvedValue([]);
		const value = {
			config: {} as unknown as MorsePackageConfig,
			walrus: {} as unknown as WalrusWriteAdapter,
			reader: {} as unknown as PublicationReader,
			address: "0xowner",
		} as unknown as MorseUploaderContextValue;
		const { result } = renderHook(() => useMorseFiles(), {
			wrapper: wrapperFor(value),
		});
		await waitFor(() => expect(result.current.status).toBe("success"));
		expect(listUserFiles).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ address: "0xowner" }),
		);
	});

	it("rejects from refresh when the context has no reader", async () => {
		const { result } = renderHook(() => useMorseFiles({ autoLoad: false }), {
			wrapper: wrapperFor(makeValue(false)),
		});
		await expect(result.current.refresh()).rejects.toThrow(/requires a reader/);
		expect(result.current.status).toBe("idle");
	});
});
