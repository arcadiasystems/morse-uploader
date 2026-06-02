import {
	addEncryptedEntry,
	addEncryptedEntryFromBytes,
	addEntry,
	addEntryFromBytes,
	type MorsePackageConfig,
	type SealAdapter,
	type WalletAdapter,
	type WalrusWriteAdapter,
} from "@arcadiasystems/morse-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MorseUploaderTarget } from "../types.js";
import { uploadFile } from "./upload-file.js";

// Fully mock the SDK boundary. Importing the real module would pull optional
// peers (@mysten/seal, @mysten/walrus) that consumers install but our unit
// tests should not require. isWalrusFlowCapable mirrors the real guard.
vi.mock("@arcadiasystems/morse-sdk", () => ({
	addEntry: vi.fn(),
	addEntryFromBytes: vi.fn(),
	addEncryptedEntry: vi.fn(),
	addEncryptedEntryFromBytes: vi.fn(),
	buildPublisherSealId: vi.fn(() => "sealId-xyz"),
	isWalrusFlowCapable: (walrus: { startBlobUpload?: unknown }) =>
		typeof walrus.startBlobUpload === "function",
}));

function makeSeal(): SealAdapter {
	return {
		encrypt: vi.fn().mockResolvedValue({ ciphertext: new Uint8Array([9, 9]) }),
		decrypt: vi.fn(),
	} as unknown as SealAdapter;
}

const config = {} as unknown as MorsePackageConfig;
const bytes = new Uint8Array([1, 2, 3]);
const target = {
	publicationId: "0xpub",
	publisherCapId: "0xcap",
	collectionName: "files",
} as unknown as MorseUploaderTarget;

const adapter = {
	address: "0xabc",
	signAndExecuteTransaction: vi.fn(),
	simulateTransaction: vi.fn(),
} as unknown as WalletAdapter;

function publisherWalrus(): WalrusWriteAdapter {
	// No startBlobUpload, so isWalrusFlowCapable returns false.
	return {
		uploadBlob: vi.fn().mockResolvedValue({
			blobId: "blobId123",
			blobObjectId: "0xblobobj",
		}),
		uploadQuilt: vi.fn(),
	} as unknown as WalrusWriteAdapter;
}

function flowWalrus(): WalrusWriteAdapter {
	// startBlobUpload presence makes isWalrusFlowCapable return true.
	return {
		uploadBlob: vi.fn(),
		uploadQuilt: vi.fn(),
		startBlobUpload: vi.fn(),
	} as unknown as WalrusWriteAdapter;
}

const baseArgs = {
	bytes,
	name: "report.pdf",
	contentType: "application/pdf",
	epochs: 5,
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("uploadFile (simple blob mode)", () => {
	it("uploads to Walrus and returns a blob result", async () => {
		const walrus = publisherWalrus();
		const result = await uploadFile({ config, walrus }, baseArgs);
		expect(result).toEqual({
			mode: "blob",
			blobId: "blobId123",
			blobObjectId: "0xblobobj",
		});
		expect(walrus.uploadBlob).toHaveBeenCalledWith(
			bytes,
			expect.objectContaining({ epochs: 5, deletable: true }),
		);
	});

	it("emits uploading then complete progress", async () => {
		const phases: string[] = [];
		await uploadFile(
			{ config, walrus: publisherWalrus() },
			{ ...baseArgs, onProgress: (e) => phases.push(e.phase) },
		);
		expect(phases).toEqual(["uploading", "complete"]);
	});

	it("forwards signal and a deletable override to Walrus", async () => {
		const walrus = publisherWalrus();
		const { signal } = new AbortController();
		await uploadFile(
			{ config, walrus },
			{ ...baseArgs, deletable: false, signal },
		);
		expect(walrus.uploadBlob).toHaveBeenCalledWith(
			bytes,
			expect.objectContaining({ epochs: 5, deletable: false, signal }),
		);
	});
});

describe("uploadFile (Morse-entry mode, direct flow-capable)", () => {
	it("delegates to addEntryFromBytes and returns an entry result", async () => {
		vi.mocked(addEntryFromBytes).mockResolvedValue({
			digest: "0xdig",
			gasUsedMist: 123n,
			entryId: 7,
			revisionId: 0,
			blobObjectId: "0xobj",
			blobId: "blobX",
		} as unknown as Awaited<ReturnType<typeof addEntryFromBytes>>);

		const result = await uploadFile(
			{ config, walrus: flowWalrus(), adapter },
			{ ...baseArgs, target },
		);

		expect(addEntryFromBytes).toHaveBeenCalledTimes(1);
		expect(addEntry).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			mode: "entry",
			entryId: 7,
			blobId: "blobX",
		});
	});

	it("forwards onProgress and signal to addEntryFromBytes", async () => {
		vi.mocked(addEntryFromBytes).mockResolvedValue({
			digest: "d",
			gasUsedMist: 0n,
			entryId: 1,
			revisionId: 0,
			blobObjectId: "0xo",
			blobId: "b",
		} as unknown as Awaited<ReturnType<typeof addEntryFromBytes>>);
		const onProgress = vi.fn();
		const { signal } = new AbortController();

		await uploadFile(
			{ config, walrus: flowWalrus(), adapter },
			{ ...baseArgs, target, onProgress, signal },
		);

		expect(addEntryFromBytes).toHaveBeenCalledWith(
			adapter,
			config,
			expect.objectContaining({ onProgress, signal }),
		);
	});
});

describe("uploadFile (Morse-entry mode, custom publisher two-step)", () => {
	it("uploads then calls addEntry, assembling the result", async () => {
		vi.mocked(addEntry).mockResolvedValue({
			digest: "0xdig2",
			gasUsedMist: 456n,
			entryId: 9,
			revisionId: 0,
		} as unknown as Awaited<ReturnType<typeof addEntry>>);
		const walrus = publisherWalrus();
		const phases: string[] = [];

		const result = await uploadFile(
			{ config, walrus, adapter },
			{ ...baseArgs, target, onProgress: (e) => phases.push(e.phase) },
		);

		expect(walrus.uploadBlob).toHaveBeenCalledTimes(1);
		expect(addEntry).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			mode: "entry",
			blobId: "blobId123",
			blobObjectId: "0xblobobj",
			entryId: 9,
			revisionId: 0,
			digest: "0xdig2",
			gasUsedMist: 456n,
			encrypted: false,
			sealId: null,
		});
		expect(phases).toEqual(["uploading", "submitting", "complete"]);
	});

	it("forwards the abort signal through both steps", async () => {
		vi.mocked(addEntry).mockResolvedValue({
			digest: "d",
			gasUsedMist: 0n,
			entryId: 1,
			revisionId: 0,
		} as unknown as Awaited<ReturnType<typeof addEntry>>);
		const walrus = publisherWalrus();
		const { signal } = new AbortController();

		await uploadFile(
			{ config, walrus, adapter },
			{ ...baseArgs, target, signal },
		);

		expect(walrus.uploadBlob).toHaveBeenCalledWith(
			bytes,
			expect.objectContaining({ signal }),
		);
		expect(addEntry).toHaveBeenCalledWith(
			adapter,
			config,
			expect.objectContaining({ signal }),
		);
	});
});

describe("uploadFile (encrypted, direct flow-capable)", () => {
	it("delegates to addEncryptedEntryFromBytes with a seal id", async () => {
		vi.mocked(addEncryptedEntryFromBytes).mockResolvedValue({
			digest: "0xdig",
			gasUsedMist: 1n,
			entryId: 4,
			revisionId: 0,
			blobObjectId: "0xobj",
			blobId: "blobE",
		} as unknown as Awaited<ReturnType<typeof addEncryptedEntryFromBytes>>);

		const onProgress = vi.fn();
		const { signal } = new AbortController();
		const result = await uploadFile(
			{ config, walrus: flowWalrus(), adapter, seal: makeSeal() },
			{ ...baseArgs, target, encrypt: true, onProgress, signal },
		);

		expect(addEncryptedEntryFromBytes).toHaveBeenCalledWith(
			adapter,
			config,
			expect.objectContaining({
				plaintext: bytes,
				sealId: "sealId-xyz",
				onProgress,
				signal,
			}),
		);
		expect(result).toMatchObject({
			mode: "entry",
			encrypted: true,
			sealId: "sealId-xyz",
			blobId: "blobE",
		});
	});
});

describe("uploadFile (encrypted, custom publisher)", () => {
	it("encrypts client-side, uploads the ciphertext, then adds the entry", async () => {
		vi.mocked(addEncryptedEntry).mockResolvedValue({
			digest: "0xdig",
			gasUsedMist: 2n,
			entryId: 5,
			revisionId: 0,
		} as unknown as Awaited<ReturnType<typeof addEncryptedEntry>>);
		const seal = makeSeal();
		const walrus = publisherWalrus();
		const phases: string[] = [];

		const result = await uploadFile(
			{ config, walrus, adapter, seal },
			{
				...baseArgs,
				target,
				encrypt: true,
				onProgress: (e) => phases.push(e.phase),
			},
		);

		expect(seal.encrypt).toHaveBeenCalledWith(bytes, { sealId: "sealId-xyz" });
		expect(walrus.uploadBlob).toHaveBeenCalledWith(
			new Uint8Array([9, 9]),
			expect.objectContaining({ epochs: 5 }),
		);
		expect(addEncryptedEntry).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({
			mode: "entry",
			encrypted: true,
			entryId: 5,
		});
		expect(phases).toEqual([
			"encrypting",
			"uploading",
			"submitting",
			"complete",
		]);
	});
});

describe("uploadFile (validation)", () => {
	it("throws when a target is given without a wallet adapter", async () => {
		await expect(
			uploadFile({ config, walrus: flowWalrus() }, { ...baseArgs, target }),
		).rejects.toThrow(/wallet adapter is required/);
	});

	it("throws when encrypt is set without a target", async () => {
		await expect(
			uploadFile(
				{ config, walrus: publisherWalrus() },
				{ ...baseArgs, encrypt: true },
			),
		).rejects.toThrow(/encryption requires a target/);
	});

	it("throws when encrypt is set without a seal adapter", async () => {
		await expect(
			uploadFile(
				{ config, walrus: flowWalrus(), adapter },
				{ ...baseArgs, target, encrypt: true },
			),
		).rejects.toThrow(/requires a seal adapter/);
	});
});
