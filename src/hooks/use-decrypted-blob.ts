import { SessionKey } from "@mysten/seal";
import { useCallback, useState } from "react";
import { DEFAULT_SESSION_TTL_MIN } from "../constants/default-session-ttl-min.js";
import { useMorseUploaderContext } from "../context/use-morse-uploader-context.js";
import { decryptFile } from "../core/decrypt-file.js";
import type {
	DecryptInput,
	DecryptStatus,
	UseDecryptedBlobResult,
} from "../types.js";

/**
 * Decrypt an encrypted file's content with status and error state. Builds the
 * Seal SessionKey from the context (signer, client, address, config) and
 * delegates to {@link decryptFile}, which re-signs once on session expiry.
 *
 * @throws {Error} (via `decrypt`) when the context is missing the seal,
 *   walrusRead, signer, client, or address deps, or when no publisherCapId is
 *   available.
 */
export function useDecryptedBlob(): UseDecryptedBlobResult {
	const ctx = useMorseUploaderContext();
	const [status, setStatus] = useState<DecryptStatus>("idle");
	const [data, setData] = useState<Uint8Array | null>(null);
	const [error, setError] = useState<unknown>(null);

	const reset = useCallback(() => {
		setStatus("idle");
		setData(null);
		setError(null);
	}, []);

	const decrypt = useCallback(
		async (input: DecryptInput): Promise<Uint8Array> => {
			const { seal, walrusRead, signer, client, address, config } = ctx;
			if (
				seal === undefined ||
				walrusRead === undefined ||
				signer === undefined ||
				client === undefined ||
				address === undefined
			) {
				throw new Error(
					"useDecryptedBlob requires seal, walrusRead, signer, client, and address on the MorseUploader context.",
				);
			}
			const publisherCapId = input.publisherCapId ?? ctx.target?.publisherCapId;
			if (publisherCapId === undefined) {
				throw new Error(
					"useDecryptedBlob requires a publisherCapId (pass it or set a target).",
				);
			}
			const ttlMin = input.ttlMin ?? DEFAULT_SESSION_TTL_MIN;
			const createSessionKey = () =>
				SessionKey.create({
					address,
					packageId: config.originalPackageId ?? config.packageId,
					ttlMin,
					signer,
					suiClient: client,
				});

			setStatus("decrypting");
			setData(null);
			setError(null);
			try {
				const plaintext = await decryptFile(
					{ seal, walrusRead, createSessionKey },
					{
						blobRef: input.blobRef,
						sealId: input.sealId,
						publisherCapId,
						...(input.signal === undefined ? {} : { signal: input.signal }),
					},
				);
				setData(plaintext);
				setStatus("success");
				return plaintext;
			} catch (err) {
				setError(err);
				setStatus("error");
				throw err;
			}
		},
		[ctx],
	);

	return { status, data, error, decrypt, reset };
}
