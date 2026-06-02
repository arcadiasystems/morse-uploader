import type {
	MorsePackageConfig,
	WalrusWriteAdapter,
} from "@arcadiasystems/morse-sdk";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { MorseUploaderContextValue } from "../types.js";
import { MorseUploaderProvider } from "./morse-uploader-provider.js";
import { useMorseUploaderContext } from "./use-morse-uploader-context.js";

const value = {
	config: {} as unknown as MorsePackageConfig,
	walrus: {} as unknown as WalrusWriteAdapter,
} as MorseUploaderContextValue;

describe("useMorseUploaderContext", () => {
	it("returns the provided value inside a provider", () => {
		const wrapper = ({ children }: { children: ReactNode }) => (
			<MorseUploaderProvider value={value}>{children}</MorseUploaderProvider>
		);
		const { result } = renderHook(() => useMorseUploaderContext(), { wrapper });
		expect(result.current).toBe(value);
	});

	it("throws when used outside a provider", () => {
		expect(() => renderHook(() => useMorseUploaderContext())).toThrow(
			/within a MorseUploaderProvider/,
		);
	});
});
