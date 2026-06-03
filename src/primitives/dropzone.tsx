import type { ReactElement } from "react";
import type { DropzoneProps } from "../types.js";
import { useDropzone } from "./use-dropzone.js";

/**
 * Unstyled drag-and-drop dropzone. Spreads the headless prop-getters onto a
 * root button and a hidden file input; pass a render-prop child to react to the
 * drag state. No inline styles: style via `className`, the `data-dragging`
 * attribute, and (for the skin) the shipped stylesheet.
 */
export function Dropzone(props: DropzoneProps): ReactElement {
	const { onFiles, accept, multiple, disabled, className, label, children } =
		props;
	const dropzone = useDropzone({
		onFiles,
		...(accept === undefined ? {} : { accept }),
		...(multiple === undefined ? {} : { multiple }),
		...(disabled === undefined ? {} : { disabled }),
		...(label === undefined ? {} : { ariaLabel: label }),
	});

	return (
		<div className={className} {...dropzone.getRootProps()}>
			<input {...dropzone.getInputProps()} hidden />
			{typeof children === "function"
				? children({ isDragging: dropzone.isDragging, open: dropzone.open })
				: children}
		</div>
	);
}
