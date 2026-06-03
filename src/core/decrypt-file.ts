import { SealError } from "@arcadiasystems/morse-sdk";
import type { DecryptFileArgs, DecryptFileDeps } from "../types.js";

/**
 * Decrypt an encrypted entry's content: read the ciphertext from Walrus, create
 * a Seal SessionKey, and decrypt. On a `session-expired` SealError it creates a
 * fresh SessionKey (a new wallet signature) and retries once.
 *
 * @throws {SealError} on no-access, decrypt-failed, or a second session-expired.
 * @throws {MorseError} subclasses on the Walrus read failure.
 */
export async function decryptFile(
	deps: DecryptFileDeps,
	args: DecryptFileArgs,
): Promise<Uint8Array> {
	const readOptions =
		args.signal === undefined ? undefined : { signal: args.signal };
	const ciphertext = await deps.walrusRead.readBlobRef(
		args.blobRef,
		readOptions,
	);
	const decryptOptions = {
		sealId: args.sealId,
		publisherCapId: args.publisherCapId,
	};

	const sessionKey = await deps.createSessionKey();
	try {
		return await deps.seal.decrypt(ciphertext, {
			sessionKey,
			...decryptOptions,
		});
	} catch (err) {
		// A stale session expires mid-flight; re-sign once and retry.
		if (err instanceof SealError && err.code === "session-expired") {
			const fresh = await deps.createSessionKey();
			return await deps.seal.decrypt(ciphertext, {
				sessionKey: fresh,
				...decryptOptions,
			});
		}
		throw err;
	}
}
