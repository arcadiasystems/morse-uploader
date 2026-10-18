import { type DragEvent, useState } from "react";
import { errorMessage } from "@/lib/error-message";
import type { PickedFile } from "@/local/local-library";
import { readDroppedItems } from "@/local/read-picked-files";
import type { FilePickers } from "../file-pickers";

/**
 * The Overview's drop zone. Dropped or chosen files and folders open the
 * upload sheet with the live price; nothing is sent until the wallet signs.
 * R3's staging tray takes drops anywhere on the window.
 */
export function DropCard({
	pickers,
	onPicked,
}: {
	pickers: FilePickers;
	onPicked: (files: PickedFile[]) => void;
}) {
	const [dragging, setDragging] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);

	function onDragOver(event: DragEvent<HTMLElement>) {
		if (!event.dataTransfer.types.includes("Files")) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
		setDragging(true);
	}

	function onDragLeave(event: DragEvent<HTMLElement>) {
		const next = event.relatedTarget;
		if (next instanceof Node && event.currentTarget.contains(next)) return;
		setDragging(false);
	}

	function onDrop(event: DragEvent<HTMLElement>) {
		event.preventDefault();
		setDragging(false);
		setProblem(null);
		readDroppedItems(event.dataTransfer).then(
			(picked) => {
				if (picked.length > 0) onPicked(picked);
			},
			(error: unknown) =>
				setProblem(
					`The browser could not read what was dropped: ${errorMessage(error)}`,
				),
		);
	}

	return (
		<div className="card span-4">
			<section
				className={dragging ? "dz on" : "dz"}
				aria-label="Drop files to upload"
				onDragOver={onDragOver}
				onDragLeave={onDragLeave}
				onDrop={onDrop}
			>
				<b>Drop files or folders</b>
				<span>
					Folders keep their structure and upload as one quilt of up to 666
					files. Up to 1 GiB per upload. Nothing is sent until you sign.
				</span>
				<span className="acts">
					<button className="btn sm" type="button" onClick={pickers.openFiles}>
						Choose files
					</button>
					<button className="btn sm" type="button" onClick={pickers.openFolder}>
						Choose folder
					</button>
				</span>
				{problem ? (
					<span className="problem" role="alert">
						{problem}
					</span>
				) : null}
			</section>
		</div>
	);
}
