import type {
	WalrusFlowCapable,
	WalrusWriteAdapter,
} from "@arcadiasystems/morse-sdk";
import { describe, expect, it, vi } from "vitest";
import { FileTooLargeError } from "./file-too-large-error.js";
import { withCiphertextSizeLimit } from "./with-ciphertext-size-limit.js";

const limit = { maxBytes: 8, maxTipMist: 10_000_000n };
const options = { epochs: 1, deletable: true };

function makeWalrus() {
	return {
		uploadBlob: vi.fn().mockResolvedValue({ blobId: "b" }),
		uploadQuilt: vi.fn().mockResolvedValue({ blobId: "q" }),
		startBlobUpload: vi.fn().mockResolvedValue({ blobId: "s" }),
	};
}

function wrap(walrus: ReturnType<typeof makeWalrus>) {
	return withCiphertextSizeLimit(
		walrus as unknown as WalrusWriteAdapter & WalrusFlowCapable,
		limit,
	);
}

describe("withCiphertextSizeLimit", () => {
	it("refuses a blob over the limit before Walrus sees it", async () => {
		const walrus = makeWalrus();
		const attempt = wrap(walrus).startBlobUpload(new Uint8Array(9), options);

		await expect(attempt).rejects.toBeInstanceOf(FileTooLargeError);
		await expect(attempt).rejects.toMatchObject({
			sizeBytes: 9,
			afterEncryption: true,
			limit,
		});
		expect(walrus.startBlobUpload).not.toHaveBeenCalled();
	});

	it("hands a blob at the limit on unchanged", async () => {
		const walrus = makeWalrus();
		const data = new Uint8Array(8);

		await expect(wrap(walrus).startBlobUpload(data, options)).resolves.toEqual({
			blobId: "s",
		});
		expect(walrus.startBlobUpload).toHaveBeenCalledWith(data, options);
	});

	it("passes the methods the upload helpers do not call straight through", async () => {
		const walrus = makeWalrus();
		const wrapped = wrap(walrus);
		const data = new Uint8Array(9);
		const patches = [{ contents: data, identifier: "a" }];

		await expect(wrapped.uploadBlob(data, options)).resolves.toEqual({
			blobId: "b",
		});
		await expect(wrapped.uploadQuilt(patches, options)).resolves.toEqual({
			blobId: "q",
		});
		expect(walrus.uploadBlob).toHaveBeenCalledWith(data, options);
		expect(walrus.uploadQuilt).toHaveBeenCalledWith(patches, options);
	});
});
