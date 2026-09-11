import { buildRecipientFileSealId, SealError } from "@arcadiasystems/morse-sdk";
import { SessionKey } from "@mysten/seal";
import { useCallback, useRef, useState } from "react";
import type {
	FileDecryptInput,
	FileDecryptStatus,
	UseFileDecryptResult,
} from "./types.js";
import { useMorseFilesContext } from "./use-morse-files-context.js";

/** Message for when the provider has no key servers to decrypt with. */
const SEAL_UNAVAILABLE =
	"No Seal key servers are configured, so decryption is unavailable. Testnet pins an open set; mainnet pins none, because every operator there is commercial. Pass `sealKeyServers` to MorseFilesProvider, starting from the SDK's MAINNET_SEAL_COMMITTEE with the apiKeyName and apiKey your operator issues.";

const DEFAULT_TTL_MIN = 10;

interface CachedSession {
	readonly address: string;
	readonly packageId: string;
	readonly key: SessionKey;
}

/**
 * Decrypt + return the plaintext of an encrypted RecipientFile. Reads the
 * ciphertext from Walrus, creates (and reuses) a Seal SessionKey, and decrypts
 * under the file's recipient policy. Re-signs once on a session-expired error.
 * The SessionKey is reusable across files for the same address and package, so
 * it is cached and re-signed only when one of those changes.
 */
export function useFileDecrypt(): UseFileDecryptResult {
	const { seal, walrusRead, signer, client, config, address } =
		useMorseFilesContext();
	const [status, setStatus] = useState<FileDecryptStatus>("idle");
	const [data, setData] = useState<Uint8Array | null>(null);
	const [error, setError] = useState<unknown>(null);
	// A SessionKey is bound to the address that signed it and to one package, so
	// the cache carries both. Reusing one across a wallet switch would sign the
	// new account's reads with the old account's session and fail at the key
	// servers, or silently keep the old account's access.
	const sessionRef = useRef<CachedSession | null>(null);

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

			if (seal === null) {
				const unavailable = new Error(SEAL_UNAVAILABLE);
				setError(unavailable);
				setStatus("error");
				throw unavailable;
			}

			const packageId = config.originalPackageId ?? config.packageId;
			const getSession = async () => {
				const cached = sessionRef.current;
				if (
					cached !== null &&
					cached.address === address &&
					cached.packageId === packageId
				) {
					return cached.key;
				}
				const key = await SessionKey.create({
					address,
					packageId,
					ttlMin: input.ttlMin ?? DEFAULT_TTL_MIN,
					signer,
					suiClient: client,
				});
				sessionRef.current = { address, packageId, key };
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
