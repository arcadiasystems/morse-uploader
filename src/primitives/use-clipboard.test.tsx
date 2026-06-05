import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useClipboard } from "./use-clipboard.js";

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("useClipboard", () => {
	it("writes text and flags copied, then resets", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", { clipboard: { writeText } });

		const { result } = renderHook(() => useClipboard(1000));
		let ok = false;
		await act(async () => {
			ok = await result.current.copy("hello");
		});
		expect(ok).toBe(true);
		expect(writeText).toHaveBeenCalledWith("hello");
		expect(result.current.copied).toBe(true);

		act(() => {
			vi.advanceTimersByTime(1000);
		});
		expect(result.current.copied).toBe(false);
		vi.unstubAllGlobals();
	});

	it("returns false when the clipboard is unavailable", async () => {
		vi.stubGlobal("navigator", {});
		const { result } = renderHook(() => useClipboard());
		let ok = true;
		await act(async () => {
			ok = await result.current.copy("x");
		});
		expect(ok).toBe(false);
		expect(result.current.copied).toBe(false);
		vi.unstubAllGlobals();
	});

	it("returns false when the write is rejected", async () => {
		const writeText = vi.fn().mockRejectedValue(new Error("denied"));
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		const { result } = renderHook(() => useClipboard());
		let ok = true;
		await act(async () => {
			ok = await result.current.copy("x");
		});
		expect(ok).toBe(false);
		expect(result.current.copied).toBe(false);
		vi.unstubAllGlobals();
	});
});
