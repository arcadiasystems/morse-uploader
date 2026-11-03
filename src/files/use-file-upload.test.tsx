import { TransportError } from "@arcadiasystems/morse-sdk";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileTooLargeError } from "./file-too-large-error.js";
import { MorseFilesProvider } from "./morse-files-provider.js";
import type { MorseFilesHandles } from "./types.js";
import { uploadErrorMessage } from "./upload-error-message.js";
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

function makeFile(size = 3): File {
	return {
		name: "r.pdf",
		type: "application/pdf",
		// The size guard reads `size`, as a real File reports it. The SDK
		// helpers are doubles that never look at the bytes, so those stay three.
		size,
		arrayBuffer: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
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

describe("useFileUpload without Seal key servers", () => {
	const noSeal = {
		adapter: {},
		config: {},
		walrusWrite: {},
		seal: null,
	} as unknown as MorseFilesHandles;
	const noSealWrapper = ({ children }: { children: ReactNode }) => (
		<MorseFilesProvider value={noSeal}>{children}</MorseFilesProvider>
	);

	it("refuses an encrypted upload with an actionable message", async () => {
		const { result } = renderHook(() => useFileUpload(), {
			wrapper: noSealWrapper,
		});
		await act(async () => {
			await expect(
				result.current.upload({ file: makeFile(), epochs: 1, encrypt: true }),
			).rejects.toThrow(/sealKeyServers/);
		});
		expect(uploadEncryptedRecipientFileFromBytes).not.toHaveBeenCalled();
	});

	it("still allows an unencrypted upload", async () => {
		// The whole point of nullable seal rather than failing setup: public
		// flows keep working on a network with no key servers.
		vi.mocked(uploadRecipientFileFromBytes).mockResolvedValue({
			fileId: "0xfile",
			blobId: "blob",
			digest: "d",
		} as never);
		const { result } = renderHook(() => useFileUpload(), {
			wrapper: noSealWrapper,
		});
		await act(async () => {
			await result.current.upload({ file: makeFile(), epochs: 1 });
		});
		expect(uploadRecipientFileFromBytes).toHaveBeenCalledTimes(1);
	});
});

describe("useFileUpload through the Walrus upload relay", () => {
	const RELAY = "https://upload-relay.mainnet.walrus.space";
	// The Walrus Mainnet relay's /v1/tip-config, as read on 2026-10-20.
	const MAINNET_TIP_CONFIG = {
		send_tip: {
			address:
				"0x765a6ff2c13b47e2603416d0b5a156df498a5c51bc8085be3838e43e06086256",
			kind: { linear: { base: 0, encoded_size_mul_per_kib: 40 } },
		},
	};
	// The Testnet relay's, read the same day: a flat tip.
	const TESTNET_TIP_CONFIG = {
		send_tip: {
			address:
				"0x4b6a7439159cf10533147fc3d678cf10b714f2bc998f6cb1f1b0b9594cdc52b6",
			kind: { const: 105 },
		},
	};
	const MAX_TIP = 10_000_000;
	// The largest file whose Walrus Mainnet tip fits under MAX_TIP.
	const LIMIT = 42_327_820;

	const walrusWrite = { startBlobUpload: vi.fn() };
	let fetch: ReturnType<typeof vi.fn>;

	function relayAnswering(body: unknown): void {
		fetch.mockImplementation(async () => new Response(JSON.stringify(body)));
	}

	function relayWrapper(max = MAX_TIP) {
		const relayHandles = {
			...handles,
			walrusWrite,
			uploadRelay: { host: RELAY, sendTip: { max } },
		} as unknown as MorseFilesHandles;
		return ({ children }: { children: ReactNode }) => (
			<MorseFilesProvider value={relayHandles}>{children}</MorseFilesProvider>
		);
	}

	beforeEach(() => {
		fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);
		relayAnswering(MAINNET_TIP_CONFIG);
		vi.mocked(uploadRecipientFileFromBytes).mockResolvedValue({
			fileId: "0xpub",
			blobId: "blobPUB",
		} as unknown as Awaited<ReturnType<typeof uploadRecipientFileFromBytes>>);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("reads the relay's tip config, then uploads a file whose tip fits through the relay's adapter", async () => {
		const file = makeFile(LIMIT);
		const { result } = renderHook(() => useFileUpload(), {
			wrapper: relayWrapper(),
		});
		await act(async () => {
			await result.current.upload({ file, epochs: 1 });
		});

		expect(fetch).toHaveBeenCalledWith(
			`${RELAY}/v1/tip-config`,
			expect.anything(),
		);
		expect(uploadRecipientFileFromBytes).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			expect.objectContaining({ walrus: walrusWrite }),
		);
		expect(result.current.status).toBe("success");
	});

	it("refuses a file whose tip is over the cap before reading it, so nothing is signed", async () => {
		const file = makeFile(LIMIT + 1);
		const { result } = renderHook(() => useFileUpload(), {
			wrapper: relayWrapper(),
		});
		await act(async () => {
			await expect(result.current.upload({ file, epochs: 1 })).rejects.toThrow(
				FileTooLargeError,
			);
		});

		expect(result.current.status).toBe("error");
		const message = uploadErrorMessage(result.current.error);
		expect(message.title).toBe("File too large");
		expect(message.description).toContain(
			"over the 40.37 MB (42,327,820 bytes) limit for one upload",
		);
		expect(message.description).toContain("caps it at 10,000,000 MIST");
		// The SDK helpers do all the signing; neither ran, and the file was
		// never read.
		expect(file.arrayBuffer).not.toHaveBeenCalled();
		expect(uploadRecipientFileFromBytes).not.toHaveBeenCalled();
		expect(uploadEncryptedRecipientFileFromBytes).not.toHaveBeenCalled();
	});

	it("refuses an encrypted file over the limit before encrypting it", async () => {
		const file = makeFile(LIMIT + 1);
		const { result } = renderHook(() => useFileUpload(), {
			wrapper: relayWrapper(),
		});
		await act(async () => {
			await expect(
				result.current.upload({ file, epochs: 1, encrypt: true }),
			).rejects.toMatchObject({ sizeBytes: LIMIT + 1, afterEncryption: false });
		});
		expect(file.arrayBuffer).not.toHaveBeenCalled();
		expect(uploadEncryptedRecipientFileFromBytes).not.toHaveBeenCalled();
	});

	it("refuses an encrypted file that Seal's envelope takes over the limit, before Walrus encodes it", async () => {
		// 2,579,480 MIST is the Walrus Mainnet tip for any blob up to 445,556
		// bytes, so that is the limit; a small one keeps the ciphertext small.
		const smallLimit = 445_556;
		vi.mocked(uploadEncryptedRecipientFileFromBytes).mockImplementation(
			async (_adapter, _config, args) => {
				// As the SDK does: encrypt, then hand the larger ciphertext to Walrus.
				await args.walrus.startBlobUpload(
					new Uint8Array(smallLimit + 1),
					args.upload,
				);
				throw new Error("startBlobUpload should have refused the ciphertext");
			},
		);
		const { result } = renderHook(() => useFileUpload(), {
			wrapper: relayWrapper(2_579_480),
		});
		await act(async () => {
			await expect(
				result.current.upload({
					file: makeFile(smallLimit),
					epochs: 1,
					encrypt: true,
				}),
			).rejects.toMatchObject({
				name: "FileTooLargeError",
				sizeBytes: smallLimit + 1,
				afterEncryption: true,
			});
		});
		expect(walrusWrite.startBlobUpload).not.toHaveBeenCalled();
	});

	it("sets no limit for a flat tip under the cap, as on Testnet", async () => {
		relayAnswering(TESTNET_TIP_CONFIG);
		const { result } = renderHook(() => useFileUpload(), {
			wrapper: relayWrapper(),
		});
		await act(async () => {
			await result.current.upload({ file: makeFile(2 ** 30), epochs: 1 });
		});
		expect(uploadRecipientFileFromBytes).toHaveBeenCalledTimes(1);
	});

	it("fails before reading the file when the relay's tip config cannot be read", async () => {
		fetch.mockRejectedValue(new TypeError("Failed to fetch"));
		const file = makeFile();
		const { result } = renderHook(() => useFileUpload(), {
			wrapper: relayWrapper(),
		});
		await act(async () => {
			await expect(result.current.upload({ file, epochs: 1 })).rejects.toThrow(
				TransportError,
			);
		});
		expect(file.arrayBuffer).not.toHaveBeenCalled();
		expect(uploadRecipientFileFromBytes).not.toHaveBeenCalled();
	});

	it("asks no relay for a tip config when none is configured", async () => {
		const { result } = renderHook(() => useFileUpload(), { wrapper });
		await act(async () => {
			await result.current.upload({ file: makeFile(LIMIT + 1), epochs: 1 });
		});
		expect(fetch).not.toHaveBeenCalled();
		expect(uploadRecipientFileFromBytes).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			expect.objectContaining({ walrus: handles.walrusWrite }),
		);
	});
});
