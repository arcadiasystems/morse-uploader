import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { MorseFilesProvider } from "./morse-files-provider.js";
import type { MorseFilesHandles } from "./types.js";
import { useStorageCostEstimate } from "./use-storage-cost-estimate.js";

function wrap(network: "testnet" | "mainnet") {
	const handles = { network } as unknown as MorseFilesHandles;
	return ({ children }: { children: ReactNode }) => (
		<MorseFilesProvider value={handles}>{children}</MorseFilesProvider>
	);
}

describe("useStorageCostEstimate", () => {
	it("computes a positive USD estimate from size and epochs", () => {
		const { result } = renderHook(
			() => useStorageCostEstimate({ sizeBytes: 1_000_000_000, epochs: 30 }),
			{ wrapper: wrap("testnet") },
		);
		// 1 GB for ~1 month at $0.023 -> about 2.3 cents.
		expect(result.current.estimate.usd).toBeCloseTo(0.023, 3);
		expect(result.current.estimate.gb).toBeCloseTo(1, 6);
	});

	it("adds encryption overhead when encrypt is set", () => {
		const plain = renderHook(
			() => useStorageCostEstimate({ sizeBytes: 1000, epochs: 5 }),
			{ wrapper: wrap("testnet") },
		);
		const encrypted = renderHook(
			() =>
				useStorageCostEstimate({ sizeBytes: 1000, epochs: 5, encrypt: true }),
			{ wrapper: wrap("testnet") },
		);
		expect(encrypted.result.current.estimate.sizeBytes).toBeGreaterThan(
			plain.result.current.estimate.sizeBytes,
		);
	});

	it("prices a mainnet epoch as longer than a testnet epoch", () => {
		const testnet = renderHook(
			() => useStorageCostEstimate({ sizeBytes: 1_000_000_000, epochs: 1 }),
			{ wrapper: wrap("testnet") },
		);
		const mainnet = renderHook(
			() => useStorageCostEstimate({ sizeBytes: 1_000_000_000, epochs: 1 }),
			{ wrapper: wrap("mainnet") },
		);
		expect(mainnet.result.current.estimate.usd).toBeGreaterThan(
			testnet.result.current.estimate.usd,
		);
	});
});
