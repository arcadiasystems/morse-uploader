/**
 * Shared types for the headless `useDropzone` primitive. The 0.2.0 files-flow
 * types live in `src/files/types.ts`.
 */

import type {
	ChangeEvent,
	DragEvent,
	KeyboardEvent,
	MouseEvent,
	RefObject,
} from "react";

/** Options for {@link useDropzone}. */
export interface UseDropzoneOptions {
	/** Called with the chosen files from a drop or the file dialog. */
	readonly onFiles: (files: File[]) => void;
	/** The file input `accept` attribute (e.g. "image/*"). */
	readonly accept?: string;
	/** Allow selecting multiple files (default true). */
	readonly multiple?: boolean;
	readonly disabled?: boolean;
	/** Accessible label applied to the root button via `aria-label`. */
	readonly ariaLabel?: string;
}

/** Props to spread on the dropzone root element. */
export interface DropzoneRootProps {
	readonly role: "button";
	readonly tabIndex: number;
	readonly "aria-disabled": boolean;
	readonly "aria-label"?: string;
	readonly "data-dragging": "true" | undefined;
	readonly onClick: (event: MouseEvent<HTMLElement>) => void;
	readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
	readonly onDragEnter: (event: DragEvent<HTMLElement>) => void;
	readonly onDragOver: (event: DragEvent<HTMLElement>) => void;
	readonly onDragLeave: (event: DragEvent<HTMLElement>) => void;
	readonly onDrop: (event: DragEvent<HTMLElement>) => void;
}

/** Props to spread on the hidden file input element. */
export interface DropzoneInputProps {
	readonly ref: RefObject<HTMLInputElement>;
	readonly type: "file";
	readonly multiple: boolean;
	readonly tabIndex: number;
	readonly accept?: string;
	readonly disabled: boolean;
	readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
	/** Stops the programmatic click from bubbling to the root and re-opening. */
	readonly onClick: (event: MouseEvent<HTMLInputElement>) => void;
}

/** Return value of {@link useClipboard}. */
export interface UseClipboardResult {
	/** True for `resetMs` after a successful copy. */
	readonly copied: boolean;
	/** Copy text; resolves to whether the write succeeded. */
	readonly copy: (text: string) => Promise<boolean>;
}

/** Return value of {@link useDropzone}. */
export interface UseDropzoneResult {
	readonly isDragging: boolean;
	/** Open the file dialog programmatically. */
	readonly open: () => void;
	readonly getRootProps: () => DropzoneRootProps;
	readonly getInputProps: () => DropzoneInputProps;
	readonly inputRef: RefObject<HTMLInputElement>;
}
