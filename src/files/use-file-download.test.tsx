import { SessionKey } from "@mysten/seal";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MorseFilesProvider } from "./morse-files-provider.js";
import { ShareLinkSealError } from "./share-link-seal-error.js";
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
// Encryption lives in the on-chain Seal prefix, not in the record itself.
const secretFile = { ...publicFile, name: "secret.txt" };

const seal: SealMaterial = {
	sealIdPrefix: new Uint8Array([1, 2, 3]),
	sealNonce: new Uint8Array([4, 5]),
};

const me = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(1));

function makeHandles(
	file: unknown,
	sealPrefix: Uint8Array | null = null,
	decrypt = vi.fn(),
): MorseFilesHandles {
	return {
		reader: {
			getRecipientFile: vi.fn().mockResolvedValue(file),
			getRecipientFileSealPrefix: vi.fn().mockResolvedValue(sealPrefix),
		},
		walrusRead: { readBlob: vi.fn().mockResolvedValue(new Uint8Array([1, 2])) },
		seal: { decryptUnderRecipientFile: decrypt },
		signer: me,
		client: {},
		config: { packageId: "0xpkg" },
		address: me.toSuiAddress(),
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

	it("decrypts when the link's Seal prefix is the file's", async () => {
		const decrypt = vi.fn().mockResolvedValue(new Uint8Array([9]));
		const handles = makeHandles(imageFile, seal.sealIdPrefix, decrypt);
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

	it("reads the Seal prefix only once the bytes are fetched", async () => {
		const handles = makeHandles(publicFile);
		const { result } = renderHook(
			() => useFileDownload("0xfile" as never, null),
			{ wrapper: wrap(handles) },
		);
		await waitFor(() => expect(result.current.metaStatus).toBe("success"));
		expect(handles.reader.getRecipientFileSealPrefix).not.toHaveBeenCalled();

		await act(async () => {
			await result.current.load();
		});
		expect(handles.reader.getRecipientFileSealPrefix).toHaveBeenCalledWith(
			"0xfile",
			expect.any(AbortSignal),
		);
	});

	it("refuses an encrypted file whose link has no Seal material and serves nothing", async () => {
		const handles = makeHandles(secretFile, seal.sealIdPrefix);
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
		expect(result.current.status).toBe("error");
		expect(result.current.error).toBeInstanceOf(ShareLinkSealError);
		expect((result.current.error as ShareLinkSealError).reason).toBe("missing");
		expect(result.current.objectUrl).toBeNull();
		expect(handles.walrusRead.readBlob).not.toHaveBeenCalled();
		expect(URL.createObjectURL).not.toHaveBeenCalled();
		expect(click).not.toHaveBeenCalled();
	});

	it("still downloads a public file when the chain has no Seal prefix", async () => {
		const handles = makeHandles(publicFile, null);
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
		expect(result.current.status).toBe("ready");
		expect(result.current.error).toBeNull();
		expect(handles.walrusRead.readBlob).toHaveBeenCalledWith("blob");
		expect(click).toHaveBeenCalledTimes(1);
	});

	it("refuses a link whose Seal prefix is not the file's, before the wallet signs", async () => {
		const decrypt = vi.fn().mockResolvedValue(new Uint8Array([9]));
		const handles = makeHandles(secretFile, new Uint8Array([7, 7, 7]), decrypt);
		const { result } = renderHook(
			() => useFileDownload("0xfile" as never, seal),
			{ wrapper: wrap(handles) },
		);
		await waitFor(() => expect(result.current.file).not.toBeNull());

		await act(async () => {
			await result.current.load();
		});
		expect(result.current.status).toBe("error");
		expect(result.current.error).toBeInstanceOf(ShareLinkSealError);
		expect((result.current.error as ShareLinkSealError).reason).toBe(
			"mismatch",
		);
		expect(SessionKey.create).not.toHaveBeenCalled();
		expect(decrypt).not.toHaveBeenCalled();
		expect(handles.walrusRead.readBlob).not.toHaveBeenCalled();
	});

	it("still decrypts a file with no on-chain prefix when the link carries Seal material", async () => {
		const decrypt = vi.fn().mockResolvedValue(new Uint8Array([9]));
		const handles = makeHandles(secretFile, null, decrypt);
		const { result } = renderHook(
			() => useFileDownload("0xfile" as never, seal),
			{ wrapper: wrap(handles) },
		);
		await waitFor(() => expect(result.current.file).not.toBeNull());

		await act(async () => {
			await result.current.load();
		});
		expect(decrypt).toHaveBeenCalledTimes(1);
		expect(result.current.status).toBe("ready");
	});

	it("stops after the prefix read when the page unmounts", async () => {
		const handles = makeHandles(publicFile);
		let release: (prefix: Uint8Array | null) => void = () => undefined;
		vi.mocked(handles.reader.getRecipientFileSealPrefix).mockReturnValue(
			new Promise((resolve) => {
				release = resolve;
			}),
		);
		const { result, unmount } = renderHook(
			() => useFileDownload("0xfile" as never, null),
			{ wrapper: wrap(handles) },
		);
		await waitFor(() => expect(result.current.file).not.toBeNull());

		let pending: Promise<void> = Promise.resolve();
		act(() => {
			pending = result.current.load();
		});
		unmount();
		await act(async () => {
			release(null);
			await pending;
		});
		const signal = vi.mocked(handles.reader.getRecipientFileSealPrefix).mock
			.calls[0]?.[1];
		expect(signal?.aborted).toBe(true);
		expect(handles.walrusRead.readBlob).not.toHaveBeenCalled();
	});
});
