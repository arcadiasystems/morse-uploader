import type { SuiClientTypes } from "@mysten/sui/client";
import { describe, expect, it } from "vitest";
import { isNetworkId } from "./is-network-id";
import { DEFAULT_NETWORK, NETWORK_IDS, NETWORKS } from "./networks";
import { walCoinTypeFromStakeSignature } from "./wal-coin-type-from-stake-signature";

describe("network config", () => {
	it("supports Testnet, the default, and Walrus Mainnet", () => {
		expect(NETWORK_IDS).toEqual(["testnet", "mainnet"]);
		expect(DEFAULT_NETWORK).toBe("testnet");
		expect(NETWORKS.testnet.label).toBe("Testnet");
		expect(NETWORKS.mainnet.label).toBe("Walrus Mainnet");
		expect(NETWORKS.mainnet.walrusLabel).toBe("Walrus Mainnet");
	});

	it("matches the protocol notes", () => {
		expect(NETWORKS.mainnet.walCoinType).toEqual({
			kind: "fixed",
			coinType:
				"0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
		});
		// Testnet package ids change on redeploy, so its WAL type is read from chain.
		expect(NETWORKS.testnet.walCoinType).toEqual({ kind: "chain" });
		expect(NETWORKS.testnet.epochDays).toBe(1);
		expect(NETWORKS.mainnet.epochDays).toBe(14);
		for (const id of NETWORK_IDS) expect(NETWORKS[id].maxEpochsAhead).toBe(53);
		expect(NETWORKS.testnet.uploadGasMist).toBe(3_975_376n + 1_030_696n);
		expect(NETWORKS.mainnet.uploadGasMist).toBe(2_134_878n + 173_696n);
	});

	it("offers official top-up pages only, with the faucet on Testnet", () => {
		for (const id of NETWORK_IDS) {
			for (const link of NETWORKS[id].topUp)
				expect(new URL(link.href).protocol).toBe("https:");
		}
		expect(
			NETWORKS.testnet.topUp.map((link) => new URL(link.href).host),
		).toEqual(["faucet.sui.io", "stake-wal.wal.app", "docs.wal.app"]);
		expect(
			NETWORKS.mainnet.topUp.map((link) => new URL(link.href).host),
		).toEqual(["walrus.xyz", "docs.sui.io"]);
	});

	it("recognizes network ids", () => {
		expect(isNetworkId("testnet")).toBe(true);
		expect(isNetworkId("mainnet")).toBe(true);
		expect(isNetworkId("devnet")).toBe(false);
		expect(isNetworkId(undefined)).toBe(false);
	});
});

describe("walCoinTypeFromStakeSignature", () => {
	const datatype = (
		typeName: string,
		typeParameters: SuiClientTypes.OpenSignatureBody[] = [],
	) => ({
		$kind: "datatype" as const,
		datatype: { typeName, typeParameters },
	});
	const stakeWithPool = (
		coin: SuiClientTypes.OpenSignatureBody,
	): SuiClientTypes.FunctionResponse => ({
		packageId:
			"0xd84704c17fc870b8764832c535aa6b11f21a95cd6f5bb38a9b07d2cf42220c66",
		moduleName: "staking",
		name: "stake_with_pool",
		visibility: "public",
		isEntry: false,
		typeParameters: [],
		parameters: [
			{ reference: "mutable", body: datatype("0xd847::staking::Staking") },
			{ reference: null, body: coin },
			{ reference: null, body: datatype("0x2::object::ID") },
		],
		returns: [],
	});

	it("reads T from Coin<T>, normalized", () => {
		const coin = datatype("0x2::coin::Coin", [
			datatype(
				"0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL",
			),
		]);
		expect(walCoinTypeFromStakeSignature(stakeWithPool(coin))).toBe(
			"0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL",
		);
	});

	it("throws when the parameter is not a coin of a datatype", () => {
		expect(() =>
			walCoinTypeFromStakeSignature(stakeWithPool({ $kind: "u64" })),
		).toThrow(/WAL coin type/);
		expect(() =>
			walCoinTypeFromStakeSignature(
				stakeWithPool(
					datatype("0x2::coin::Coin", [{ $kind: "typeParameter", index: 0 }]),
				),
			),
		).toThrow(/WAL coin type/);
	});
});
