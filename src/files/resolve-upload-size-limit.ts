import { ConfigurationError } from "@arcadiasystems/morse-sdk";
import { fetchRelayTipStrategy } from "./fetch-relay-tip-strategy.js";
import { maxBlobBytesForTip } from "./max-blob-bytes-for-tip.js";
import type { UploadRelayOptions, UploadSizeLimit } from "./types.js";

/**
 * The largest upload the relay's tip cap allows, or `null` when nothing caps
 * the size: no relay, no tip, no finite `max`, or a tip that does not grow
 * with size and fits under `max`.
 *
 * Resolves the tip the way `@mysten/walrus` does: an inline `sendTip.kind` is
 * used as is, and `{ max }` alone means reading the relay's `/v1/tip-config`,
 * which happens here, before the upload starts.
 *
 * @throws {ConfigurationError} When `max` is below the relay's tip for even
 *   the smallest blob, so the relay would refuse every upload.
 * @throws {TransportError} When the relay's tip config cannot be read.
 */
export async function resolveUploadSizeLimit(
	relay: UploadRelayOptions | undefined,
): Promise<UploadSizeLimit | null> {
	if (relay === undefined) {
		return null;
	}
	const { sendTip } = relay;
	if (sendTip === undefined || sendTip === null) {
		return null;
	}
	// The SDK refuses a tip only when it is greater than `max`, which no tip is
	// when `max` is missing, infinite or NaN.
	if (sendTip.max === undefined || !Number.isFinite(sendTip.max)) {
		return null;
	}
	// Tips are whole MIST, so a fractional cap allows what its floor allows.
	const maxTipMist = BigInt(Math.floor(sendTip.max));
	const strategy =
		"kind" in sendTip ? sendTip.kind : await fetchRelayTipStrategy(relay.host);
	if (strategy === null) {
		return null;
	}
	const maxBytes = maxBlobBytesForTip(strategy, maxTipMist);
	if (maxBytes === null) {
		return null;
	}
	if (maxBytes === 0) {
		throw new ConfigurationError(
			`sendTip.max is ${maxTipMist.toLocaleString("en-US")} MIST, below the tip the upload relay at ${relay.host} charges for even the smallest file, so it would refuse every upload. Raise sendTip.max in walrusWriteConfig.uploadRelay.`,
		);
	}
	return { maxBytes, maxTipMist };
}
