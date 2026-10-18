import type { RelayTipConfig } from "./upload-cost";

/** `/v1/tip-config` as the relays serve it (PROTOCOL-NOTES section 4). */
interface TipConfigJson {
	send_tip: {
		address: string;
		kind:
			| { const: number }
			| { linear: { base: number; encoded_size_mul_per_kib: number } };
	};
}

/**
 * Reads what the upload relay asks per upload. A relay that asks nothing
 * answers with a plain string, which is `null` here.
 * @throws {Error} When the relay does not answer or answers with an unknown shape.
 */
export async function readRelayTipConfig(
	relayUrl: string,
	signal: AbortSignal,
): Promise<RelayTipConfig | null> {
	const response = await fetch(`${relayUrl}/v1/tip-config`, { signal });
	if (!response.ok)
		throw new Error(
			`The upload relay answered ${response.status} when asked for its tip.`,
		);
	return parseRelayTipConfig(await response.json());
}

export function parseRelayTipConfig(json: unknown): RelayTipConfig | null {
	if (typeof json === "string") return null;
	if (!isTipConfigJson(json))
		throw new Error("The upload relay described its tip in an unknown way.");
	const { address, kind } = json.send_tip;
	return "const" in kind
		? { address, tip: { kind: "const", mist: BigInt(kind.const) } }
		: {
				address,
				tip: {
					kind: "linear",
					baseMist: BigInt(kind.linear.base),
					perEncodedKibMist: BigInt(kind.linear.encoded_size_mul_per_kib),
				},
			};
}

function isTipConfigJson(json: unknown): json is TipConfigJson {
	if (typeof json !== "object" || json === null || !("send_tip" in json))
		return false;
	const sendTip = json.send_tip;
	if (typeof sendTip !== "object" || sendTip === null) return false;
	if (!("address" in sendTip) || typeof sendTip.address !== "string")
		return false;
	if (!("kind" in sendTip)) return false;
	const kind = sendTip.kind;
	if (typeof kind !== "object" || kind === null) return false;
	if ("const" in kind) return typeof kind.const === "number";
	if (!("linear" in kind)) return false;
	const linear = kind.linear;
	return (
		typeof linear === "object" &&
		linear !== null &&
		"base" in linear &&
		typeof linear.base === "number" &&
		"encoded_size_mul_per_kib" in linear &&
		typeof linear.encoded_size_mul_per_kib === "number"
	);
}
