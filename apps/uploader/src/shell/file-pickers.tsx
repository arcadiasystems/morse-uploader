import { type ChangeEvent, type ReactNode, useRef } from "react";
import type { PickedFile } from "@/local/local-library";
import { readInputFiles } from "@/local/read-picked-files";

export interface FilePickers {
	openFiles: () => void;
	openFolder: () => void;
	/** The hidden inputs; render them once. */
	inputs: ReactNode;
}

/**
 * The browser's file and folder pickers behind hidden inputs, for the
 * Upload button and the Overview's drop zone. What they return goes to the
 * staging tray.
 */
export function useFilePickers(
	onPicked: (picked: PickedFile[]) => void,
): FilePickers {
	const files = useRef<HTMLInputElement>(null);
	const folder = useRef<HTMLInputElement>(null);

	function onChange(event: ChangeEvent<HTMLInputElement>) {
		const list = event.currentTarget.files;
		if (list && list.length > 0) onPicked(readInputFiles(list));
		// Choosing the same files again must fire change again.
		event.currentTarget.value = "";
	}

	return {
		openFiles: () => files.current?.click(),
		openFolder: () => folder.current?.click(),
		inputs: (
			<>
				<input
					ref={files}
					type="file"
					multiple
					hidden
					tabIndex={-1}
					aria-hidden="true"
					data-picker="files"
					onChange={onChange}
				/>
				<input
					ref={(node) => {
						folder.current = node;
						// Not in React's input attributes; every current browser supports it.
						node?.setAttribute("webkitdirectory", "");
					}}
					type="file"
					hidden
					tabIndex={-1}
					aria-hidden="true"
					data-picker="folder"
					onChange={onChange}
				/>
			</>
		),
	};
}
