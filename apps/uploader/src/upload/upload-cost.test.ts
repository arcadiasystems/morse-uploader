import { describe, expect, it } from "vitest";
import {
	batchCost,
	batchGas,
	itemCost,
	type RelayTipConfig,
	relayTip,
	relayTipMax,
	signatureCount,
	type WalrusPricing,
} from "./upload-cost";

// Live prices from PROTOCOL-NOTES section 4 (2026-10-17).
const TESTNET: WalrusPricing = {
	storagePricePerUnit: 2_364n,
	writePricePerUnit: 4_725n,
	nShards: 1000,
};
const MAINNET: WalrusPricing = {
	storagePricePerUnit: 51_854n,
	writePricePerUnit: 94_184n,
	nShards: 1000,
};
const TESTNET_TIP: RelayTipConfig = {
	address: "0x4b6a7439159cf10533147fc3d678cf10b714f2bc998f6cb1f1b0b9594cdc52b6",
	tip: { kind: "const", mist: 105n },
};
const MAINNET_TIP: RelayTipConfig = {
	address: "0x765a6ff2c13b47e2603416d0b5a156df498a5c51bc8085be3838e43e06086256",
	tip: { kind: "linear", baseMist: 0n, perEncodedKibMist: 40n },
};

describe("itemCost", () => {
	it("prices the smallest Testnet upload for one epoch like the low-funds floor", () => {
		const cost = itemCost(1, 1, TESTNET, TESTNET_TIP);
		expect(cost.units).toBe(63n);
		expect(cost.storageFrost + cost.writeFrost).toBe(446_607n);
		expect(cost.tipMist).toBe(105n);
	});

	it("prices 1 year of a 1.2 MB blob on Walrus Mainnet at 0.0938 WAL (notes section 13, item 6)", () => {
		const cost = itemCost(1_200_000, 27, MAINNET, MAINNET_TIP);
		expect(cost.units).toBe(67n);
		expect(cost.storageFrost).toBe(67n * 51_854n * 27n);
		expect(cost.storageFrost).toBe(93_803_886n);
		expect(cost.writeFrost).toBe(67n * 94_184n);
	});
});

describe("relayTip", () => {
	it("is a constant 105 MIST on Testnet", () => {
		expect(relayTip(TESTNET_TIP, 4_888_852_000n)).toBe(105n);
	});

	// The notes' worked tips: 1.2 MB and 96 MB files on Walrus Mainnet.
	it.each([
		[70_038_000n, 2_735_880n],
		[496_464_000n, 19_393_160n],
		[4_888_852_000n, 190_970_800n],
	])("charges 40 MIST per started KiB of %d encoded bytes on Walrus Mainnet", (encoded, tip) => {
		expect(relayTip(MAINNET_TIP, encoded)).toBe(tip);
	});

	it("is nothing when the relay asks no tip", () => {
		expect(relayTip(null, 70_038_000n)).toBe(0n);
	});
});

describe("relayTipMax", () => {
	it("allows a quarter more than the quoted tip", () => {
		expect(relayTipMax(105n)).toBe(132);
		expect(relayTipMax(2_735_880n)).toBe(3_419_850);
	});
});

describe("signatureCount", () => {
	it("is two for one blob or one quilt: register, then certify", () => {
		expect(signatureCount({ items: 1, encryptedItems: 0, entries: 0 })).toBe(2);
	});

	it("is N + 1 for N items: one register each and one certify for the batch", () => {
		expect(signatureCount({ items: 5, encryptedItems: 0, entries: 0 })).toBe(6);
	});

	it("adds one per encrypted file and one per Morse entry", () => {
		expect(signatureCount({ items: 2, encryptedItems: 2, entries: 0 })).toBe(5);
		expect(signatureCount({ items: 1, encryptedItems: 0, entries: 3 })).toBe(5);
	});

	it("certifies a hundred items per transaction, below Sui's size limit", () => {
		expect(signatureCount({ items: 100, encryptedItems: 0, entries: 0 })).toBe(
			101,
		);
		expect(signatureCount({ items: 101, encryptedItems: 0, entries: 0 })).toBe(
			103,
		);
	});

	it("is zero when nothing goes up", () => {
		expect(signatureCount({ items: 0, encryptedItems: 0, entries: 0 })).toBe(0);
	});
});

describe("batchCost and batchGas", () => {
	it("adds up the items of a batch", () => {
		const cost = batchCost([1, 1], 1, TESTNET, TESTNET_TIP);
		expect(cost.walFrost).toBe(2n * 446_607n);
		expect(cost.tipMist).toBe(210n);
		expect(cost.encodedSize).toBe(2n * 66_034_000n);
	});

	it("counts every register, a certify per item and each record transaction", () => {
		const gas = batchGas(
			{
				registerMist: [6_863_277n, 7_167_277n],
				certifyMist: 1_030_696n,
				entryMist: 3_972_353n,
				recipientFileMist: 4_800_000n,
			},
			{ items: 2, encryptedItems: 1, entries: 1 },
		);
		expect(gas).toBe(
			6_863_277n + 7_167_277n + 2n * 1_030_696n + 4_800_000n + 3_972_353n,
		);
	});
});
