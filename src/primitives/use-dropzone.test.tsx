import { act, renderHook } from "@testing-library/react";
import type { ChangeEvent, DragEvent, KeyboardEvent, MouseEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { useDropzone } from "./use-dropzone.js";

function dragEvent(files: File[]) {
	return {
		preventDefault: vi.fn(),
		dataTransfer: { files },
	} as unknown as DragEvent<HTMLElement>;
}

const file = new File(["x"], "x.txt", { type: "text/plain" });

describe("useDropzone", () => {
	it("emits files on drop and toggles the dragging flag", () => {
		const onFiles = vi.fn();
		const { result } = renderHook(() => useDropzone({ onFiles }));
		const root = result.current.getRootProps();

		act(() => root.onDragEnter(dragEvent([])));
		expect(result.current.getRootProps()["data-dragging"]).toBe("true");

		act(() => root.onDrop(dragEvent([file])));
		expect(onFiles).toHaveBeenCalledWith([file]);
		expect(result.current.getRootProps()["data-dragging"]).toBeUndefined();
	});

	it("ignores empty drops and dragleave clears the flag", () => {
		const onFiles = vi.fn();
		const { result } = renderHook(() => useDropzone({ onFiles }));
		act(() => result.current.getRootProps().onDragEnter(dragEvent([])));
		act(() => result.current.getRootProps().onDragLeave(dragEvent([])));
		act(() => result.current.getRootProps().onDrop(dragEvent([])));
		expect(onFiles).not.toHaveBeenCalled();
		expect(result.current.getRootProps()["data-dragging"]).toBeUndefined();
	});

	it("opens the dialog on Enter and Space", () => {
		const onFiles = vi.fn();
		const { result } = renderHook(() => useDropzone({ onFiles }));
		// renderHook does not mount the input, so wire the ref to a click spy.
		const click = vi.fn();
		(result.current.inputRef as { current: HTMLInputElement | null }).current =
			{ click } as unknown as HTMLInputElement;
		const key = (k: string) =>
			({
				key: k,
				preventDefault: vi.fn(),
			}) as unknown as KeyboardEvent<HTMLElement>;

		act(() => result.current.getRootProps().onKeyDown(key("Enter")));
		act(() => result.current.getRootProps().onKeyDown(key(" ")));
		act(() => result.current.getRootProps().onKeyDown(key("a")));
		expect(click).toHaveBeenCalledTimes(2);
	});

	it("does nothing when disabled", () => {
		const onFiles = vi.fn();
		const { result } = renderHook(() =>
			useDropzone({ onFiles, disabled: true }),
		);
		const root = result.current.getRootProps();
		expect(root.tabIndex).toBe(-1);
		act(() => root.onDrop?.(dragEvent([file])));
		act(() => root.onDrop(dragEvent([file])));
		expect(onFiles).not.toHaveBeenCalled();
	});

	it("input onChange emits and onClick stops propagation", () => {
		const onFiles = vi.fn();
		const { result } = renderHook(() => useDropzone({ onFiles }));
		const input = result.current.getInputProps();
		input.onChange({
			target: { files: [file] },
		} as unknown as ChangeEvent<HTMLInputElement>);
		expect(onFiles).toHaveBeenCalledWith([file]);

		const stop = vi.fn();
		input.onClick({
			stopPropagation: stop,
		} as unknown as MouseEvent<HTMLInputElement>);
		expect(stop).toHaveBeenCalledTimes(1);
	});
});
