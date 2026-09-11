import type { SealAdapter } from "@arcadiasystems/morse-sdk";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UseMorseFilesOptions } from "./types.js";
import { useMorseFiles } from "./use-morse-files.js";

// Hoisted so the vi.mock factory (which runs before the module body) can close
// over them.
const { fromAccountAsync, sealFromMorseConfig } = vi.hoisted(() => ({
	fromAccountAsync: vi.fn(),
	sealFromMorseConfig: vi.fn(),
}));

// morseConfig and the codecs stay real: the point of most of these tests is
// what the real per-network config implies (testnet pins key servers, mainnet
// pins none). Only the client-building surface is stubbed.
vi.mock("@arcadiasystems/morse-sdk", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@arcadiasystems/morse-sdk")>();
	return {
		...actual,
		WalletStandardSigner: { fromAccountAsync },
		DefaultWalrusWriteAdapter: { fromConfig: () => ({ kind: "walrus-write" }) },
		HttpAggregatorReadAdapter: {
			fromMorseConfig: () => ({ kind: "walrus-read" }),
		},
		DefaultSealAdapter: { fromMorseConfig: sealFromMorseConfig },
		RpcRecipientFilesReader: { fromConfig: () => ({ kind: "reader" }) },
	};
});

vi.mock("@mysten/sui/grpc", () => ({
	SuiGrpcClient: class {
		constructor(readonly options: unknown) {}
	},
}));

const ADDRESS = `0x${"ab".repeat(32)}`;

function options(
	overrides: Partial<UseMorseFilesOptions> = {},
): UseMorseFilesOptions {
	return {
		network: "testnet",
		account: { address: ADDRESS },
		callbacks: {
			signAndExecuteTransaction: vi.fn(),
			signTransaction: vi.fn(),
			signPersonalMessage: vi.fn(),
		},
		pubkeyCache: undefined,
		...overrides,
	} as unknown as UseMorseFilesOptions;
}

beforeEach(() => {
	vi.clearAllMocks();
	fromAccountAsync.mockResolvedValue({ kind: "signer" });
	sealFromMorseConfig.mockReturnValue({ kind: "seal" });
});

describe("useMorseFiles", () => {
	it("builds handles for testnet, where the config pins key servers", async () => {
		const { result } = renderHook(() => useMorseFiles(options()));

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.handles?.address).toBe(ADDRESS);
		expect(result.current.handles?.seal).toEqual({ kind: "seal" });
		expect(sealFromMorseConfig).toHaveBeenCalledWith(
			expect.anything(),
			{ serverConfigs: expect.arrayContaining([expect.anything()]) },
			expect.anything(),
		);
	});

	it("leaves seal null on mainnet when no credential is supplied", async () => {
		const { result } = renderHook(() =>
			useMorseFiles(options({ network: "mainnet" })),
		);

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.handles?.seal).toBeNull();
		expect(sealFromMorseConfig).not.toHaveBeenCalled();
	});

	it("builds seal on mainnet from caller-supplied key servers", async () => {
		const sealKeyServers = [
			{ objectId: "0x1", weight: 1, apiKeyName: "k", apiKey: "secret" },
		] as unknown as NonNullable<UseMorseFilesOptions["sealKeyServers"]>;
		const { result } = renderHook(() =>
			useMorseFiles(options({ network: "mainnet", sealKeyServers })),
		);

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.handles?.seal).toEqual({ kind: "seal" });
		expect(sealFromMorseConfig).toHaveBeenCalledWith(
			expect.anything(),
			{ serverConfigs: sealKeyServers },
			expect.anything(),
		);
	});

	it("prefers a prebuilt seal adapter over building one", async () => {
		const seal = { kind: "prebuilt" } as unknown as SealAdapter;
		const { result } = renderHook(() => useMorseFiles(options({ seal })));

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.handles?.seal).toBe(seal);
		expect(sealFromMorseConfig).not.toHaveBeenCalled();
	});

	it("rebuilds on address change but not on fresh callback literals", async () => {
		const { result, rerender } = renderHook(
			(props: UseMorseFilesOptions) => useMorseFiles(props),
			{ initialProps: options() },
		);
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(fromAccountAsync).toHaveBeenCalledTimes(1);

		rerender(options());
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(fromAccountAsync).toHaveBeenCalledTimes(1);

		rerender(
			options({
				account: {
					address: `0x${"cd".repeat(32)}`,
				} as UseMorseFilesOptions["account"],
			}),
		);
		await waitFor(() => expect(fromAccountAsync).toHaveBeenCalledTimes(2));
	});

	it("reports setup failures instead of throwing", async () => {
		const boom = new Error("wallet refused");
		fromAccountAsync.mockRejectedValue(boom);
		const { result } = renderHook(() => useMorseFiles(options()));

		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(result.current.error).toBe(boom);
		expect(result.current.handles).toBeNull();
	});
});
