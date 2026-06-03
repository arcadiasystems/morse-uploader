import type {
	MorsePackageConfig,
	WalrusWriteAdapter,
} from "@arcadiasystems/morse-sdk";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { MorseUploaderProvider } from "../context/morse-uploader-provider.js";
import type { MorseUploaderContextValue, WalrusQuerySource } from "../types.js";
import { useEpochCostEstimate } from "./use-epoch-cost-estimate.js";

function makeClient(): WalrusQuerySource {
	return {
		storageCost: vi
			.fn()
			.mockResolvedValue({ storageCost: 10n, writeCost: 2n, totalCost: 12n }),
	} as unknown as WalrusQuerySource;
}

function makeValue(client?: WalrusQuerySource): MorseUploaderContextValue {
	return {
		config: {} as unknown as MorsePackageConfig,
		walrus: {} as unknown as WalrusWriteAdapter,
		...(client === undefined ? {} : { walrusClient: client }),
	} as MorseUploaderContextValue;
}

function wrapperFor(value: MorseUploaderContextValue) {
	return ({ children }: { children: ReactNode }) => (
		<MorseUploaderProvider value={value}>{children}</MorseUploaderProvider>
	);
}

describe("useEpochCostEstimate", () => {
	it("computes the estimate on mount", async () => {
		const client = makeClient();
		const { result } = renderHook(
			() => useEpochCostEstimate({ sizeBytes: 1000, epochs: 5 }),
			{ wrapper: wrapperFor(makeValue(client)) },
		);
		await waitFor(() => expect(result.current.status).toBe("success"));
		expect(client.storageCost).toHaveBeenCalledWith(1000, 5);
		expect(result.current.estimate?.walFrost).toBe(12n);
	});

	it("recomputes when epochs change", async () => {
		const client = makeClient();
		const { rerender } = renderHook(
			({ epochs }) => useEpochCostEstimate({ sizeBytes: 1000, epochs }),
			{ initialProps: { epochs: 5 }, wrapper: wrapperFor(makeValue(client)) },
		);
		await waitFor(() =>
			expect(client.storageCost).toHaveBeenCalledWith(1000, 5),
		);
		rerender({ epochs: 10 });
		await waitFor(() =>
			expect(client.storageCost).toHaveBeenCalledWith(1000, 10),
		);
	});

	it("does not compute when disabled", async () => {
		const client = makeClient();
		const { result } = renderHook(
			() =>
				useEpochCostEstimate({ sizeBytes: 1000, epochs: 5, enabled: false }),
			{ wrapper: wrapperFor(makeValue(client)) },
		);
		expect(result.current.status).toBe("idle");
		expect(client.storageCost).not.toHaveBeenCalled();
	});

	it("rejects from refresh when the context has no walrusClient", async () => {
		const { result } = renderHook(
			() =>
				useEpochCostEstimate({ sizeBytes: 1000, epochs: 5, enabled: false }),
			{ wrapper: wrapperFor(makeValue()) },
		);
		await expect(result.current.refresh()).rejects.toThrow(
			/requires a walrusClient/,
		);
	});
});
