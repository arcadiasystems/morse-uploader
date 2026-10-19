import { TransportError } from "@arcadiasystems/morse-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRelayTipStrategy } from "./fetch-relay-tip-strategy.js";

const HOST = "https://upload-relay.mainnet.walrus.space";

// The relays' /v1/tip-config bodies, as read on 2026-10-20.
const MAINNET_BODY = {
	send_tip: {
		address:
			"0x765a6ff2c13b47e2603416d0b5a156df498a5c51bc8085be3838e43e06086256",
		kind: { linear: { base: 0, encoded_size_mul_per_kib: 40 } },
	},
};
const TESTNET_BODY = {
	send_tip: {
		address:
			"0x4b6a7439159cf10533147fc3d678cf10b714f2bc998f6cb1f1b0b9594cdc52b6",
		kind: { const: 105 },
	},
};

function relayAnswering(body: string, status = 200) {
	const fetch = vi.fn(async () => new Response(body, { status }));
	vi.stubGlobal("fetch", fetch);
	return fetch;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("fetchRelayTipStrategy", () => {
	it("reads the Walrus Mainnet relay's linear tip from /v1/tip-config", async () => {
		const fetch = relayAnswering(JSON.stringify(MAINNET_BODY));

		await expect(fetchRelayTipStrategy(HOST)).resolves.toEqual({
			linear: { base: 0, perEncodedKib: 40 },
		});
		expect(fetch).toHaveBeenCalledWith(
			`${HOST}/v1/tip-config`,
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});

	it("reads the Testnet relay's flat tip", async () => {
		relayAnswering(JSON.stringify(TESTNET_BODY));
		await expect(fetchRelayTipStrategy(HOST)).resolves.toEqual({ const: 105 });
	});

	it("returns null when the relay answers with a string, meaning no tip", async () => {
		relayAnswering(JSON.stringify("no_tip"));
		await expect(fetchRelayTipStrategy(HOST)).resolves.toBeNull();
	});

	it("names the relay and the status when it answers with an error", async () => {
		relayAnswering("unavailable", 503);
		const attempt = fetchRelayTipStrategy(HOST);
		await expect(attempt).rejects.toBeInstanceOf(TransportError);
		await expect(attempt).rejects.toThrow(`${HOST} answered HTTP 503`);
		await expect(attempt).rejects.toMatchObject({
			operation: "walrus.relay.tipConfig",
		});
	});

	it("keeps the cause when the relay cannot be reached", async () => {
		const offline = new TypeError("Failed to fetch");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw offline;
			}),
		);
		const attempt = fetchRelayTipStrategy(HOST);
		await expect(attempt).rejects.toThrow(
			`Could not reach the upload relay at ${HOST}`,
		);
		await expect(attempt).rejects.toMatchObject({ cause: offline });
	});

	it("refuses a body that is not JSON", async () => {
		relayAnswering("<html>");
		await expect(fetchRelayTipStrategy(HOST)).rejects.toThrow(
			"sent a tip config this version cannot read",
		);
	});

	it.each([
		["an unknown tip kind", { send_tip: { kind: { tiered: [1, 2] } } }],
		["a negative tip", { send_tip: { kind: { const: -1 } } }],
		[
			"a fractional rate",
			{
				send_tip: {
					kind: { linear: { base: 0, encoded_size_mul_per_kib: 0.5 } },
				},
			},
		],
		["a missing rate", { send_tip: { kind: { linear: { base: 0 } } } }],
		["no send_tip", { tip: 1 }],
		["null", null],
	])("refuses %s", async (_label, body) => {
		relayAnswering(JSON.stringify(body));
		await expect(fetchRelayTipStrategy(HOST)).rejects.toBeInstanceOf(
			TransportError,
		);
	});
});
