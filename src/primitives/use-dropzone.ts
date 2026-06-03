import { useCallback, useRef, useState } from "react";
import type {
	DropzoneInputProps,
	DropzoneRootProps,
	UseDropzoneOptions,
	UseDropzoneResult,
} from "../types.js";

/**
 * Headless drag-and-drop file selection. Returns prop-getters for a root
 * element (keyboard-operable button with ARIA + drag state) and a hidden file
 * input, so consumers own all markup and styling. No `window`/`document`
 * access; SSR-safe.
 */
export function useDropzone(options: UseDropzoneOptions): UseDropzoneResult {
	const {
		onFiles,
		accept,
		multiple = true,
		disabled = false,
		ariaLabel,
	} = options;
	const inputRef = useRef<HTMLInputElement>(null);
	const [isDragging, setIsDragging] = useState(false);

	const open = useCallback(() => {
		if (disabled) {
			return;
		}
		inputRef.current?.click();
	}, [disabled]);

	const emit = useCallback(
		(list: FileList | null) => {
			if (list === null || list.length === 0) {
				return;
			}
			onFiles(Array.from(list));
		},
		[onFiles],
	);

	const getRootProps = useCallback(
		(): DropzoneRootProps => ({
			role: "button",
			tabIndex: disabled ? -1 : 0,
			"aria-disabled": disabled,
			"data-dragging": isDragging ? "true" : undefined,
			...(ariaLabel === undefined ? {} : { "aria-label": ariaLabel }),
			onClick: () => open(),
			onKeyDown: (event) => {
				if (disabled) {
					return;
				}
				// Enter and Space activate a role=button element.
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					open();
				}
			},
			onDragEnter: (event) => {
				if (disabled) {
					return;
				}
				event.preventDefault();
				setIsDragging(true);
			},
			onDragOver: (event) => {
				// preventDefault is required for the drop event to fire.
				if (!disabled) {
					event.preventDefault();
				}
			},
			onDragLeave: (event) => {
				if (disabled) {
					return;
				}
				event.preventDefault();
				setIsDragging(false);
			},
			onDrop: (event) => {
				if (disabled) {
					return;
				}
				event.preventDefault();
				setIsDragging(false);
				emit(event.dataTransfer?.files ?? null);
			},
		}),
		[disabled, isDragging, open, emit, ariaLabel],
	);

	const getInputProps = useCallback(
		(): DropzoneInputProps => ({
			ref: inputRef,
			type: "file",
			multiple,
			tabIndex: -1,
			disabled,
			...(accept === undefined ? {} : { accept }),
			onChange: (event) => emit(event.target.files),
			// The root's onClick calls input.click(); stop that programmatic click
			// from bubbling back to the root and re-opening the dialog.
			onClick: (event) => event.stopPropagation(),
		}),
		[accept, multiple, disabled, emit],
	);

	return { isDragging, open, getRootProps, getInputProps, inputRef };
}
