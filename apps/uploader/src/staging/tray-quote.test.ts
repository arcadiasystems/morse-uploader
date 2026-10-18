import { describe, expect, it } from "vitest";
import type { EpochClock } from "@/blobs/epoch-clock";
import { type LocalLibrary, rootsFromPicked } from "@/local/local-library";
import type { PublishTarget } from "@/morse/read-publish-targets";
import { NETWORKS } from "@/network/networks";
import type { QuoteInputs } from "@/upload/use-upload-quote";
import { checkPrice, quoteTray, trayBatch } from "./tray-quote";
import { DEFAULT_TRAY_SETTINGS, type TraySettings } from "./tray-settings";

const DAY_MS = 86_400_000;
const OWNER =
	"0x4ea7c836fe1c4ac1a40a54a41622e1e60bd7dcc22188ba1e50a7c469b9ae4c75";
// The Testnet clock from PROTOCOL-NOTES section 5, 21 hours into epoch 553.
const CLOCK: EpochClock = {
	epoch: 553,
	epochStartMs: Date.parse("2026-10-16T22:46:52Z"),
	epochDurationMs: DAY_MS,
};
const NOW = Date.parse("2026-10-17T19:52:00Z");
const INPUTS: QuoteInputs = {
	pricing: {
		storagePricePerUnit: 2_364n,
		writePricePerUnit: 4_725n,
		nShards: 1000,
	},
	clock: CLOCK,
	tip: {
		address:
			"0x4b6a7439159cf10533147fc3d678cf10b714f2bc998f6cb1f1b0b9594cdc52b6",
		tip: { kind: "const", mist: 105n },
	},
	seal: {
		envelope: { keyServers: 2, identityBytes: 49 },
		policyPackageId:
			"0x191946c5dc1ea1b978e664d85455e81ef9bdd1d3dbb221fd48cf9008d46a00f0",
	},
};
const TARGETS: PublishTarget[] = [
	{
		publicationId: "0xpub",
		publicationName: "Claude Testnet Run",
		publicationSlug: "claude-testnet-run-1",
		publisherCapId: "0xcap",
		collections: [
			{ name: "notes", storageMode: "blob" },
			{ name: "gallery", storageMode: "quilt" },
		],
	},
];

let next = 0;
function library(paths: readonly string[]): LocalLibrary {
	return rootsFromPicked(
		paths.map((path) => ({ path, file: new File(["hello"], path) })),
		() => `root-${next++}`,
	);
}

function quote(
	paths: readonly string[],
	settings: Partial<TraySettings> = {},
	inputs: QuoteInputs = INPUTS,
	nowMs = NOW,
) {
	return quoteTray({
		library: library(paths),
		settings: { ...DEFAULT_TRAY_SETTINGS, ...settings },
		inputs,
		network: NETWORKS.testnet,
		pricedAtMs: nowMs,
		publishTargets: TARGETS,
	});
}

describe("the tray's signature count", () => {
	const signatures = (
		paths: readonly string[],
		settings: Partial<TraySettings> = {},
	) => quote(paths, settings).quote?.signatureTotal;

	it("asks 2 signatures for one file or one folder as a quilt: register and certify", () => {
		expect(signatures(["a.txt"])).toBe(2);
		expect(signatures(["site/a.txt", "site/b/c.txt"])).toBe(2);
	});

	it("asks one register per item and one certify for the batch", () => {
		expect(signatures(["site/a.txt", "site/b.txt"], { mode: "per-file" })).toBe(
			3,
		);
		expect(signatures(["a.txt", "site/b.txt"])).toBe(3);
	});

	it("adds one certify per hundred items", () => {
		const many = Array.from({ length: 150 }, (_, index) => `f${index}.txt`);
		expect(signatures(many)).toBe(150 + 2);
	});

	it("adds the access policy of each encrypted file, and folders go one blob per file", () => {
		const tray = quote(["site/a.txt", "site/b.txt"], { encrypt: true });
		expect(tray.sealing).toBe(true);
		expect(tray.plan.items.map((item) => item.kind)).toEqual(["blob", "blob"]);
		expect(tray.quote?.signatureTotal).toBe(2 + 1 + 2);
	});

	it("adds one per Morse entry when publishing, and none when publishing is blocked", () => {
		expect(signatures(["a.txt"], { publish: true })).toBe(3);
		expect(signatures(["site/a.txt", "site/b.txt"], { publish: true })).toBe(4);
		const permanent = quote(["a.txt"], { publish: true, deletable: false });
		expect(permanent.blocker).toEqual({ kind: "not-deletable" });
		expect(permanent.publishing).toBe(false);
		expect(permanent.quote?.signatureTotal).toBe(2);
	});
});

describe("keep for", () => {
	it("defaults to the network's first period that fits: 7 days on Testnet", () => {
		const tray = quote(["a.txt"]);
		expect(tray.keep).toEqual({ kind: "period", id: "7d" });
		expect(tray.epochs).toBe(8);
	});

	it("takes exact epochs within the 53-epoch limit", () => {
		expect(
			quote(["a.txt"], { keep: { kind: "epochs", epochs: 1 } }).epochs,
		).toBe(1);
		expect(
			quote(["a.txt"], { keep: { kind: "epochs", epochs: 90 } }).epochs,
		).toBe(53);
	});

	it("has no price for a period this network does not offer", () => {
		const tray = quote(["a.txt"], { keep: { kind: "period", id: "1y" } });
		expect(tray.epochs).toBeNull();
		expect(tray.quote).toBeNull();
	});
});

describe("re-pricing before signing", () => {
	const shown = quote(["a.txt", "b.txt"]);

	it("goes ahead when the price, tip, period and signatures still hold", () => {
		expect(checkPrice(shown, quote(["a.txt", "b.txt"]))).toEqual({
			kind: "same",
		});
	});

	it("stops when a price vote changed the storage price since the tray opened", () => {
		const voted = {
			...INPUTS,
			pricing: { ...INPUTS.pricing, storagePricePerUnit: 2_400n },
		};
		const check = checkPrice(shown, quote(["a.txt", "b.txt"], {}, voted));
		expect(check.kind).toBe("changed");
		if (check.kind !== "changed") return;
		// 63 storage units per small blob, 8 epochs, 36 FROST more per unit-epoch.
		expect(check.after.walFrost).toBe(
			(check.before.walFrost ?? 0n) + 2n * 63n * 8n * 36n,
		);
		expect(check.after.epochs).toBe(check.before.epochs);
	});

	it("stops when the relay asks a different tip", () => {
		const tipped = {
			...INPUTS,
			tip: INPUTS.tip
				? { ...INPUTS.tip, tip: { kind: "const" as const, mist: 200n } }
				: null,
		};
		expect(checkPrice(shown, quote(["a.txt", "b.txt"], {}, tipped)).kind).toBe(
			"changed",
		);
	});

	it("stops when the clock moved and the period now needs another epoch", () => {
		// Walrus Mainnet epochs last 14 days: 30 days is 3 epochs up to 12 days
		// into an epoch and 4 after (PROTOCOL-NOTES section 5).
		const clock: EpochClock = {
			epoch: 41,
			epochStartMs: Date.parse("2026-10-06T15:10:31Z"),
			epochDurationMs: 14 * DAY_MS,
		};
		const mainnet = (nowMs: number) =>
			quoteTray({
				library: library(["a.txt"]),
				settings: {
					...DEFAULT_TRAY_SETTINGS,
					keep: { kind: "period", id: "30d" },
				},
				inputs: { ...INPUTS, clock, seal: null },
				network: NETWORKS.mainnet,
				pricedAtMs: nowMs,
				publishTargets: null,
			});
		const opened = mainnet(clock.epochStartMs + 11.9 * DAY_MS);
		const signing = mainnet(clock.epochStartMs + 12.1 * DAY_MS);
		const check = checkPrice(opened, signing);
		expect(check).toMatchObject({
			kind: "changed",
			before: { epochs: 3 },
			after: { epochs: 4 },
		});
		if (check.kind !== "changed") return;
		expect(check.after.walFrost).toBeGreaterThan(check.before.walFrost ?? 0n);
	});
});

describe("trayBatch", () => {
	it("queues one job per item with the period, the tip ceiling and its share of the quote", () => {
		const tray = quote(["a.txt", "site/b.txt", "site/c.txt"], {
			keep: { kind: "epochs", epochs: 1 },
		});
		const batch = trayBatch({
			tray,
			network: NETWORKS.testnet,
			owner: OWNER,
			deletable: true,
			registerMist: [6_000_000n, 6_100_000n],
		});
		expect(batch?.network).toBe("testnet");
		expect(
			batch?.jobs.map((job) => [job.plan.kind, job.epochs, job.tipMaxMist]),
		).toEqual([
			["blob", 1, 132],
			["quilt", 1, 132],
		]);
		const [blob] = batch?.jobs ?? [];
		// The register as simulated, the tip, and one certify as observed.
		expect(blob?.estimate.suiMist).toBe(
			6_000_000n + 105n + NETWORKS.testnet.observedGas.certifyMist,
		);
		expect(blob?.publish).toBeNull();
	});

	it("leaves gas unknown when the simulation does not match the plan, and sends nothing without a price", () => {
		const tray = quote(["a.txt"], { publish: true });
		const batch = trayBatch({
			tray,
			network: NETWORKS.testnet,
			owner: OWNER,
			deletable: true,
			registerMist: [1n, 2n],
		});
		expect(batch?.jobs[0]?.estimate.suiMist).toBeNull();
		expect(batch?.jobs[0]?.publish?.collectionName).toBe("notes");
		const unpriced = quote(["a.txt"], { keep: { kind: "period", id: "2y" } });
		expect(
			trayBatch({
				tray: unpriced,
				network: NETWORKS.testnet,
				owner: OWNER,
				deletable: true,
				registerMist: null,
			}),
		).toBeNull();
	});
});
