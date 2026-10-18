import { describe, expect, it } from "vitest";
import { rootsFromPicked } from "@/local/local-library";
import { NETWORKS } from "@/network/networks";
import { parseRelayTipConfig } from "./relay-tip-config";
import { buildUploadPlan } from "./upload-plan";
import { buildQuote, itemEstimates, quoteGas } from "./upload-quote";

const PRICING = {
	storagePricePerUnit: 2_371n,
	writePricePerUnit: 4_741n,
	nShards: 1000,
};

// Testnet's /v1/tip-config as served on 2026-10-18.
const TIP = parseRelayTipConfig({
	send_tip: {
		address:
			"0x4b6a7439159cf10533147fc3d678cf10b714f2bc998f6cb1f1b0b9594cdc52b6",
		kind: { const: 105 },
	},
});

function planOf(paths: readonly string[]) {
	let next = 0;
	const library = rootsFromPicked(
		paths.map((path) => ({ path, file: new File(["hello"], path) })),
		() => `root-${next++}`,
	);
	const selected = new Set(
		library.flatMap((root) => root.files.map((file) => file.id)),
	);
	return buildUploadPlan({
		library,
		selected,
		mode: "per-file",
		seal: null,
		nShards: 1000,
	});
}

describe("parseRelayTipConfig", () => {
	it("reads a constant tip and a linear one", () => {
		expect(TIP).toEqual({
			address:
				"0x4b6a7439159cf10533147fc3d678cf10b714f2bc998f6cb1f1b0b9594cdc52b6",
			tip: { kind: "const", mist: 105n },
		});
		expect(
			parseRelayTipConfig({
				send_tip: {
					address:
						"0x765a6ff2c13b47e2603416d0b5a156df498a5c51bc8085be3838e43e06086256",
					kind: { linear: { base: 0, encoded_size_mul_per_kib: 40 } },
				},
			})?.tip,
		).toEqual({ kind: "linear", baseMist: 0n, perEncodedKibMist: 40n });
	});

	it("reads a relay that asks no tip as null, and refuses an unknown shape", () => {
		expect(parseRelayTipConfig("no tip required")).toBeNull();
		expect(() => parseRelayTipConfig({ send_tip: { kind: {} } })).toThrow(
			/unknown way/,
		);
	});
});

describe("buildQuote", () => {
	const plan = planOf(["a.txt", "b.txt"]);
	const quote = buildQuote({
		plan,
		epochs: 1,
		publishing: true,
		pricing: PRICING,
		tip: TIP,
	});

	it("bills each small blob 63 units of storage for one epoch and the write fee", () => {
		expect(quote.cost.walFrost).toBe(2n * 63n * (2_371n + 4_741n));
	});

	it("counts two registers, one certify and two entries", () => {
		expect(quote.signatures).toEqual({
			items: 2,
			encryptedItems: 0,
			entries: 2,
		});
		expect(quote.signatureTotal).toBe(5);
		expect(quote.tipMaxMist).toEqual([132, 132]);
	});

	it("adds simulated registers to the observed certify and entry gas", () => {
		const observed = NETWORKS.testnet.observedGas;
		expect(quoteGas(quote, [6_000_000n, 6_100_000n], observed)).toBe(
			12_100_000n + 2n * observed.certifyMist + 2n * observed.entryMist,
		);
	});

	it("splits the quote per item for the queue's batch line", () => {
		const observed = NETWORKS.testnet.observedGas;
		const [first] = itemEstimates(
			quote,
			plan,
			true,
			[6_000_000n, 6_100_000n],
			observed,
		);
		expect(first).toEqual({
			walFrost: 448_056n,
			suiMist: 105n + 6_000_000n + observed.certifyMist + observed.entryMist,
		});
		expect(
			itemEstimates(quote, plan, true, null, observed)[0]?.suiMist,
		).toBeNull();
	});
});
