import { ConfigurationError } from "@arcadiasystems/morse-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveUploadSizeLimit } from "./resolve-upload-size-limit.js";

const HOST = "https://upload-relay.mainnet.walrus.space";
const MAINNET_BODY = {
	send_tip: {
		address: "0x765a",
		kind: { linear: { base: 0, encoded_size_mul_per_kib: 40 } },
	},
};

let fetch: ReturnType<typeof vi.fn>;

function relayAnswering(body: unknown): void {
	fetch.mockImplementation(async () => new Response(JSON.stringify(body)));
}

beforeEach(() => {
	fetch = vi.fn();
	vi.stubGlobal("fetch", fetch);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("resolveUploadSizeLimit", () => {
	it("reads the relay's tip config for { max } and derives the limit", async () => {
		relayAnswering(MAINNET_BODY);

		await expect(
			resolveUploadSizeLimit({ host: HOST, sendTip: { max: 10_000_000 } }),
		).resolves.toEqual({ maxBytes: 42_327_820, maxTipMist: 10_000_000n });
		expect(fetch).toHaveBeenCalledWith(
			`${HOST}/v1/tip-config`,
			expect.anything(),
		);
	});

	it("uses an inline tip config without asking the relay, as the SDK does", async () => {
		const limit = await resolveUploadSizeLimit({
			host: HOST,
			sendTip: {
				address: "0x765a",
				max: 10_000_000,
				kind: { linear: { base: 0, perEncodedKib: 40 } },
			},
		});
		expect(limit).toEqual({ maxBytes: 42_327_820, maxTipMist: 10_000_000n });
		expect(fetch).not.toHaveBeenCalled();
	});

	it("allows what the floor of a fractional cap allows", async () => {
		relayAnswering(MAINNET_BODY);
		await expect(
			resolveUploadSizeLimit({ host: HOST, sendTip: { max: 10_000_000.9 } }),
		).resolves.toEqual({ maxBytes: 42_327_820, maxTipMist: 10_000_000n });
	});

	it.each([
		["no relay", undefined],
		["no sendTip", { host: HOST }],
		["a null sendTip", { host: HOST, sendTip: null }],
		[
			"an infinite cap",
			{ host: HOST, sendTip: { max: Number.POSITIVE_INFINITY } },
		],
		[
			"an inline config with no max",
			{
				host: HOST,
				sendTip: { address: "0x765a", kind: { const: 105 } },
			},
		],
	])("sets no limit for %s, and asks the relay nothing", async (_label, relay) => {
		await expect(resolveUploadSizeLimit(relay)).resolves.toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("sets no limit when the relay charges no tip", async () => {
		relayAnswering("no_tip");
		await expect(
			resolveUploadSizeLimit({ host: HOST, sendTip: { max: 10_000_000 } }),
		).resolves.toBeNull();
	});

	it("sets no limit for Testnet's flat tip under the cap", async () => {
		relayAnswering({ send_tip: { address: "0x4b6a", kind: { const: 105 } } });
		await expect(
			resolveUploadSizeLimit({ host: HOST, sendTip: { max: 10_000_000 } }),
		).resolves.toBeNull();
	});

	it("refuses a cap below the smallest file's tip as a configuration error", async () => {
		relayAnswering(MAINNET_BODY);
		const attempt = resolveUploadSizeLimit({
			host: HOST,
			sendTip: { max: 1_000_000 },
		});
		await expect(attempt).rejects.toBeInstanceOf(ConfigurationError);
		await expect(attempt).rejects.toThrow(
			`sendTip.max is 1,000,000 MIST, below the tip the upload relay at ${HOST} charges for even the smallest file`,
		);
	});
});
