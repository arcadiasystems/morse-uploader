import { useCallback, useMemo, useState } from "react";
import {
	allFiles,
	type LocalLibrary,
	type PickedFile,
	rootsFromPicked,
} from "./local-library";

export interface PickedFiles {
	library: LocalLibrary;
	/** Every picked file: the upload sheet takes them all. */
	selected: ReadonlySet<string>;
	/** What a new pick or drop brings replaces the last one. */
	replace: (picked: readonly PickedFile[]) => void;
}

/**
 * The files picked or dropped for the next upload. Until R3's staging tray
 * gathers several drops, each pick goes straight to the upload sheet and
 * replaces the previous one. Files are handles: nothing is read until an
 * upload starts, and nothing is kept after the tab closes.
 */
export function usePickedFiles(): PickedFiles {
	const [library, setLibrary] = useState<LocalLibrary>([]);
	const replace = useCallback((picked: readonly PickedFile[]) => {
		setLibrary(rootsFromPicked(picked, () => crypto.randomUUID()));
	}, []);
	const selected = useMemo(
		() => new Set(allFiles(library).map((file) => file.id)),
		[library],
	);
	return { library, selected, replace };
}
