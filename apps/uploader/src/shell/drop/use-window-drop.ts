import { useEffect, useEffectEvent, useState } from "react";
import { errorMessage } from "@/lib/error-message";
import type { PickedFile } from "@/local/local-library";
import { readDroppedItems } from "@/local/read-picked-files";

interface WindowDropOptions {
	/** What a drop brought, with each file's path from the dropped item. */
	onFiles: (picked: PickedFile[]) => void;
	/** Why a drop gave nothing to stage. */
	onProblem: (message: string) => void;
}

/**
 * While a drag is over the page the browser fires `dragover` every 350 ms
 * (give or take 200, HTML's drag-and-drop processing model). Without one
 * for this long, the drag has gone even if no `dragleave` said so.
 */
const DRAG_GONE_MS = 1_000;

/** Whether a drag carries files, not text or a link dragged within the page. */
function carriesFiles(event: DragEvent): boolean {
	return event.dataTransfer?.types.includes("Files") ?? false;
}

/**
 * Drop anywhere (handover item 1): files and folders dragged over any part
 * of the window raise the drop state, and a drop hands them over with their
 * relative paths. The browser fires enter and leave for every element the
 * pointer crosses, so a depth count tells when the drag has left the window;
 * a drag that leaves without a final `dragleave` (a cancelled drag, a quick
 * exit) clears once `dragover` stops arriving. Entries are taken while the
 * drop event runs; the folder walk finishes later. Drags that carry no
 * files are left to the page.
 * @returns Whether files are being dragged over the window now.
 */
export function useWindowDrop({
	onFiles,
	onProblem,
}: WindowDropOptions): boolean {
	const [dragging, setDragging] = useState(false);
	const deliver = useEffectEvent((picked: PickedFile[]) => {
		if (picked.length > 0) onFiles(picked);
		else
			onProblem("The drop held no files: empty folders have nothing to stage.");
	});
	const fail = useEffectEvent((error: unknown) =>
		onProblem(
			`The browser could not read what was dropped: ${errorMessage(error)}`,
		),
	);

	useEffect(() => {
		let depth = 0;
		let gone: ReturnType<typeof setTimeout> | undefined;
		function onEnd() {
			clearTimeout(gone);
			depth = 0;
			setDragging(false);
		}
		function stillHere() {
			clearTimeout(gone);
			gone = setTimeout(onEnd, DRAG_GONE_MS);
		}
		function onEnter(event: DragEvent) {
			if (!carriesFiles(event)) return;
			event.preventDefault();
			depth += 1;
			setDragging(true);
			stillHere();
		}
		function onOver(event: DragEvent) {
			if (!carriesFiles(event)) return;
			// Without this the browser opens the file instead of dropping it.
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
			setDragging(true);
			stillHere();
		}
		function onLeave(event: DragEvent) {
			if (!carriesFiles(event)) return;
			depth = Math.max(0, depth - 1);
			if (depth === 0) onEnd();
		}
		function onDrop(event: DragEvent) {
			if (!carriesFiles(event) || !event.dataTransfer) return;
			event.preventDefault();
			onEnd();
			readDroppedItems(event.dataTransfer).then(
				(picked) => deliver(picked),
				(error: unknown) => fail(error),
			);
		}
		window.addEventListener("dragenter", onEnter);
		window.addEventListener("dragover", onOver);
		window.addEventListener("dragleave", onLeave);
		window.addEventListener("dragend", onEnd);
		window.addEventListener("drop", onDrop);
		return () => {
			clearTimeout(gone);
			window.removeEventListener("dragenter", onEnter);
			window.removeEventListener("dragover", onOver);
			window.removeEventListener("dragleave", onLeave);
			window.removeEventListener("dragend", onEnd);
			window.removeEventListener("drop", onDrop);
		};
	}, []);

	return dragging;
}
