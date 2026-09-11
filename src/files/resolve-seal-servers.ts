import type { KeyServerConfig } from "@mysten/seal";

/**
 * Pick the Seal key servers to build the default adapter from, or `undefined`
 * when there are none and the adapter must be skipped.
 *
 * Testnet pins an open allowlist, so `morseConfig` supplies servers there and
 * nothing is needed from the consumer. Mainnet pins none, because every
 * operator is commercial: without `sealKeyServers` the encrypted paths cannot
 * work, and the honest answer is no adapter rather than a broken one.
 *
 * Consumer-supplied servers win, so a consumer can point testnet at their own
 * operator too.
 */
export function resolveSealServers(
	fromOptions: readonly KeyServerConfig[] | undefined,
	fromConfig: readonly KeyServerConfig[],
): readonly KeyServerConfig[] | undefined {
	if (fromOptions !== undefined && fromOptions.length > 0) {
		return fromOptions;
	}
	return fromConfig.length > 0 ? fromConfig : undefined;
}
