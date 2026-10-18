import { useCallback, useMemo, useState } from "react";
import {
	addRoots,
	allFiles,
	type LocalLibrary,
	type PickedFile,
	removeFiles,
	rootsFromPicked,
} from "./local-library";
import { setSelected } from "./local-tree";

export interface LocalLibraryState {
	library: LocalLibrary;
	selected: ReadonlySet<string>;
	expanded: ReadonlySet<string>;
	/** Adds picked or dropped files and selects them; returns their ids. */
	add: (picked: readonly PickedFile[]) => string[];
	toggle: (fileIds: readonly string[], on: boolean) => void;
	selectAll: () => void;
	clearSelection: () => void;
	removeSelected: () => void;
	toggleFolder: (key: string) => void;
}

/**
 * "This computer": the files dropped or picked in this tab, which are
 * selected and which folders are open. Files are handles; nothing is read
 * until an upload starts, and nothing is kept after the tab closes.
 */
export function useLocalLibrary(): LocalLibraryState {
	const [library, setLibrary] = useState<LocalLibrary>([]);
	const [selected, setSelection] = useState<ReadonlySet<string>>(new Set());
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

	const add = useCallback((picked: readonly PickedFile[]) => {
		const roots = rootsFromPicked(picked, () => crypto.randomUUID());
		const ids = roots.flatMap((root) => root.files.map((file) => file.id));
		setLibrary((current) => addRoots(current, roots));
		setSelection((current) => setSelected(current, ids, true));
		return ids;
	}, []);

	const toggle = useCallback((fileIds: readonly string[], on: boolean) => {
		setSelection((current) => setSelected(current, fileIds, on));
	}, []);

	const selectAll = useCallback(() => {
		setSelection(new Set(allFiles(library).map((file) => file.id)));
	}, [library]);

	const clearSelection = useCallback(() => setSelection(new Set()), []);

	const removeSelected = useCallback(() => {
		setLibrary((current) => removeFiles(current, selected));
		setSelection(new Set());
	}, [selected]);

	const toggleFolder = useCallback((key: string) => {
		setExpanded((current) => {
			const next = new Set(current);
			if (!next.delete(key)) next.add(key);
			return next;
		});
	}, []);

	// A folder dropped again replaces the old one; its old files' ids drop out of the selection.
	const live = useMemo(() => {
		const ids = new Set(allFiles(library).map((file) => file.id));
		return new Set([...selected].filter((id) => ids.has(id)));
	}, [library, selected]);

	return {
		library,
		selected: live,
		expanded,
		add,
		toggle,
		selectAll,
		clearSelection,
		removeSelected,
		toggleFolder,
	};
}
