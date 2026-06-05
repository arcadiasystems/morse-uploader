import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MorseFilesProvider } from "./morse-files-provider.js";
import type { MorseFilesHandles, SealMaterial } from "./types.js";
import { useFileDownload } from "./use-file-download.js";

vi.mock("@mysten/seal", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mysten/seal")>();
	return {
		...actual,
		SessionKey: { create: vi.fn().mockResolvedValue({ id: "session" }) },
	};
});

const publicFile = {
	id: "0xfile",
	owner: "0xme",
	blobId: "blob",
	blobObjectId: null,
	name: "note.txt",
	contentType: "text/plain",
	size: 5,
	members: [],
	createdAtMs: 0,
};
const imageFile = {
	...publicFile,
	name: "secret.png",
	contentType: "image/png",
};

const seal: SealMaterial = {
	sealIdPrefix: new Uint8Array([1, 2, 3]),
	sealNonce: new Uint8Array([4, 5]),
};

function makeHandles(file: unknown, decrypt = vi.fn()): MorseFilesHandles {
	return {
		reader: { getRecipientFile: vi.fn().mockResolvedValue(file) },
		walrusRead: { readBlob: vi.fn().mockResolvedValue(new Uint8Array([1, 2])) },
		seal: { decryptUnderRecipientFile: decrypt },
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

beforeEach(() => {
	vi.clearAllMocks();
	URL.createObjectURL = vi.fn(() => "blob:obj");
	URL.revokeObjectURL = vi.fn();
});

describe("useFileDownload", () => {
	it("loads metadata and reads a public blob", async () => {
		const handles = makeHandles(publicFile);
		const { result } = renderHook(
			() => useFileDownload("0xfile" as never, null),
			{ wrapper: wrap(handles) },
		);
		await waitFor(() => expect(result.current.file).not.toBeNull());
		expect(result.current.encrypted).toBe(false);

		await act(async () => {
			await result.current.load();
		});
		expect(result.current.status).toBe("ready");
		expect(result.current.objectUrl).toBe("blob:obj");
	});

	it("decrypts when seal material is provided", async () => {
		const decrypt = vi.fn().mockResolvedValue(new Uint8Array([9]));
		const handles = makeHandles(imageFile, decrypt);
		const { result } = renderHook(
			() => useFileDownload("0xfile" as never, seal),
			{ wrapper: wrap(handles) },
		);
		await waitFor(() => expect(result.current.file).not.toBeNull());
		expect(result.current.encrypted).toBe(true);
		expect(result.current.isImage).toBe(true);

		await act(async () => {
			await result.current.load();
		});
		expect(decrypt).toHaveBeenCalledTimes(1);
		expect(result.current.status).toBe("ready");
	});

	it("download loads then triggers a save", async () => {
		const handles = makeHandles(publicFile);
		const click = vi
			.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(() => undefined);
		const { result } = renderHook(
			() => useFileDownload("0xfile" as never, null),
			{ wrapper: wrap(handles) },
		);
		await waitFor(() => expect(result.current.file).not.toBeNull());

		await act(async () => {
			await result.current.download();
		});
		expect(click).toHaveBeenCalledTimes(1);
	});
});
