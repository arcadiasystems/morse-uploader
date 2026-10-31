import type {
	WalrusFlowCapable,
	WalrusWriteAdapter,
} from "@arcadiasystems/morse-sdk";
import { FileTooLargeError } from "./file-too-large-error.js";
import type { UploadSizeLimit } from "./types.js";

/**
 * Wrap `walrus` so `startBlobUpload` refuses a blob over `limit` before
 * handing it on. For encrypted uploads: Seal's envelope depends on the key
 * servers, so the size Walrus stores is known only once the SDK has
 * encrypted, and the SDK's upload helper passes the ciphertext straight to
 * `startBlobUpload`, which encodes it and then signs the register
 * transaction. Checking on entry is the last point before either.
 *
 * The upload helpers call only `startBlobUpload`; the other methods pass
 * through unchanged.
 */
export function withCiphertextSizeLimit(
	walrus: WalrusWriteAdapter & WalrusFlowCapable,
	limit: UploadSizeLimit,
): WalrusWriteAdapter & WalrusFlowCapable {
	return {
		uploadBlob: (data, options) => walrus.uploadBlob(data, options),
		uploadQuilt: (patches, options) => walrus.uploadQuilt(patches, options),
		startBlobUpload: async (data, options) => {
			if (data.length > limit.maxBytes) {
				throw new FileTooLargeError({
					sizeBytes: data.length,
					afterEncryption: true,
					limit,
				});
			}
			return walrus.startBlobUpload(data, options);
		},
	};
}
