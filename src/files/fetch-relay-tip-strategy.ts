import { TransportError } from "@arcadiasystems/morse-sdk";
import type { TipStrategy } from "@mysten/walrus";

const OPERATION = "walrus.relay.tipConfig";
/** The timeout `@mysten/walrus` uses for relay requests. */
const TIMEOUT_MS = 30_000;

/**
 * Read how the upload relay at `host` wants to be tipped, from the
 * `/v1/tip-config` endpoint `@mysten/walrus` reads before it sends a tip.
 * `null` when the relay charges no tip, which it says by answering with a
 * JSON string rather than an object.
 *
 * @throws {TransportError} When the relay cannot be reached, answers with an
 *   error status, or sends a tip config this version cannot read.
 */
export async function fetchRelayTipStrategy(
	host: string,
): Promise<TipStrategy | null> {
	let response: Response;
	try {
		response = await fetch(`${host}/v1/tip-config`, {
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch (cause) {
		throw new TransportError(
			`Could not reach the upload relay at ${host} to read its tip config.`,
			{ cause, operation: OPERATION },
		);
	}
	if (!response.ok) {
		throw new TransportError(
			`The upload relay at ${host} answered HTTP ${response.status} when asked for its tip config.`,
			{ operation: OPERATION },
		);
	}
	let body: unknown;
	try {
		body = await response.json();
	} catch (cause) {
		throw unreadable(host, cause);
	}
	if (typeof body === "string") {
		return null;
	}
	const kind = field(field(body, "send_tip"), "kind");
	const constant = field(kind, "const");
	if (isMist(constant)) {
		return { const: constant };
	}
	const linear = field(kind, "linear");
	const base = field(linear, "base");
	const perEncodedKib = field(linear, "encoded_size_mul_per_kib");
	if (isMist(base) && isMist(perEncodedKib)) {
		return { linear: { base, perEncodedKib } };
	}
	throw unreadable(host);
}

function field(value: unknown, key: string): unknown {
	if (typeof value !== "object" || value === null) {
		return undefined;
	}
	return (value as Readonly<Record<string, unknown>>)[key];
}

function isMist(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function unreadable(host: string, cause?: unknown): TransportError {
	return new TransportError(
		`The upload relay at ${host} sent a tip config this version cannot read.`,
		cause === undefined
			? { operation: OPERATION }
			: { cause, operation: OPERATION },
	);
}
