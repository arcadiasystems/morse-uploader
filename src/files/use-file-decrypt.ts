import { buildRecipientFileSealId, SealError } from "@arcadiasystems/morse-sdk";
import { SessionKey } from "@mysten/seal";
import { useCallback, useRef, useState } from "react";
import type {
	FileDecryptInput,
	FileDecryptStatus,
	UseFileDecryptResult,
} from "./types.js";
import { useMorseFilesContext } from "./use-morse-files-context.js";

const DEFAULT_TTL_MIN = 10;

/**
 * Decrypt + return the plaintext of an encrypted RecipientFile. Reads the
 * ciphertext from Walrus, creates (and reuses) a Seal SessionKey, and decrypts
 * under the file's recipient policy. Re-signs once on a session-expired error.
 * The SessionKey is reusable across files for the same package, so it is cached
 * for the lifetime of the hook.
 */
export function useFileDecrypt(): UseFileDecryptResult {
	const { seal, walrusRead, signer, client, config, address } =
		useMorseFilesContext();
	const [status, setStatus] = useState<FileDecryptStatus>("idle");
	const [data, setData] = useState<Uint8Array | null>(null);
	const [error, setError] = useState<unknown>(null);
	const sessionRef = useRef<SessionKey | null>(null);

	const reset = useCallback(() => {
		setStatus("idle");
		setData(null);
		setError(null);
	}, []);

	const decrypt = useCallback(
		async (input: FileDecryptInput): Promise<Uint8Array> => {
			setStatus("working");
			setData(null);
			setError(null);

			const newSession = () =>
				SessionKey.create({
					address,
					packageId: config.originalPackageId ?? config.packageId,
					ttlMin: input.ttlMin ?? DEFAULT_TTL_MIN,
					signer,
					suiClient: client,
				});
			const getSession = async () => {
				if (sessionRef.current !== null) {
					return sessionRef.current;
				}
				const key = await newSession();
				sessionRef.current = key;
				return key;
			};

			try {
				const ciphertext = await walrusRead.readBlob(input.file.blobId);
				const options = {
					sealId: buildRecipientFileSealId(input.sealIdPrefix, input.sealNonce),
					fileId: input.file.id,
				};
				try {
					const plaintext = await seal.decryptUnderRecipientFile(ciphertext, {
						...options,
						sessionKey: await getSession(),
					});
					setData(plaintext);
					setStatus("success");
					return plaintext;
				} catch (err) {
					// Stale session: drop the cache, re-sign once, and retry.
					if (err instanceof SealError && err.code === "session-expired") {
						sessionRef.current = null;
						const plaintext = await seal.decryptUnderRecipientFile(ciphertext, {
							...options,
							sessionKey: await getSession(),
						});
						setData(plaintext);
						setStatus("success");
						return plaintext;
					}
					throw err;
				}
			} catch (err) {
				setError(err);
				setStatus("error");
				throw err;
			}
		},
		[seal, walrusRead, signer, client, config, address],
	);

	return { status, data, error, decrypt, reset };
}
