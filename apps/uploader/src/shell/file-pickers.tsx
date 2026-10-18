import { type ChangeEvent, type ReactNode, useRef } from "react";
import type { PickedFile } from "@/local/local-library";
import { readInputFiles } from "@/local/read-picked-files";

export interface FilePickers {
	openFiles: () => void;
	/** Opens the file picker; the files it returns go straight to the upload sheet. */
	openFilesToUpload: () => void;
	openFolder: () => void;
	/** The hidden inputs; render them once. */
	inputs: ReactNode;
}

/**
 * The browser's file and folder pickers behind hidden inputs, shared by the
 * local pane and the Upload button (phones have no local pane: uploads
 * start from the picker there).
 */
export function useFilePickers(
	onPicked: (picked: PickedFile[], thenUpload: boolean) => void,
): FilePickers {
	const files = useRef<HTMLInputElement>(null);
	const folder = useRef<HTMLInputElement>(null);
	// Set by each opening and cleared by each pick, so it never carries over.
	const thenUpload = useRef(false);

	function open(input: HTMLInputElement | null, upload: boolean) {
		thenUpload.current = upload;
		input?.click();
	}

	function onChange(event: ChangeEvent<HTMLInputElement>) {
		const upload = thenUpload.current;
		thenUpload.current = false;
		const list = event.currentTarget.files;
		if (list && list.length > 0) onPicked(readInputFiles(list), upload);
		// Choosing the same files again must fire change again.
		event.currentTarget.value = "";
	}

	return {
		openFiles: () => open(files.current, false),
		openFilesToUpload: () => open(files.current, true),
		openFolder: () => open(folder.current, false),
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
