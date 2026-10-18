import { type DragEvent, useMemo, useState } from "react";
import { errorMessage } from "@/lib/error-message";
import { formatBytes } from "@/lib/format-bytes";
import { groupThousands } from "@/lib/group-thousands";
import { allFiles, type PickedFile } from "@/local/local-library";
import { buildLocalRows } from "@/local/local-tree";
import { readDroppedItems } from "@/local/read-picked-files";
import type { LocalLibraryState } from "@/local/use-local-library";
import type { FilePickers } from "../file-pickers";
import { LocalList } from "../local-list/local-list";
import { ViewToggle } from "./view-toggle";

interface LocalPaneProps {
	local: LocalLibraryState;
	pickers: FilePickers;
	onAdd: (picked: PickedFile[]) => void;
	nowMs: number;
}

/**
 * "This computer": files and folders dropped here or picked, as a tree with
 * sizes and selection. Hidden on phones, where uploads start from the
 * picker behind the Upload button.
 */
export function LocalPane({ local, pickers, onAdd, nowMs }: LocalPaneProps) {
	const [dragging, setDragging] = useState(false);
	const [dropError, setDropError] = useState<string | null>(null);
	const rows = useMemo(
		() => buildLocalRows(local.library, local.expanded),
		[local.library, local.expanded],
	);
	const files = useMemo(() => allFiles(local.library), [local.library]);
	const chosen = files.filter((file) => local.selected.has(file.id));
	const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
	const chosenBytes = chosen.reduce((sum, file) => sum + file.size, 0);
	const empty = files.length === 0;

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
		setDropError(null);
		readDroppedItems(event.dataTransfer).then(
			(picked) => {
				if (picked.length > 0) onAdd(picked);
			},
			(error: unknown) =>
				setDropError(
					`The browser could not read what was dropped: ${errorMessage(error)}`,
				),
		);
	}

	const dropZone = (
		<div className={dragging ? "drop on" : "drop"}>
			<b>Drop files or folders here</b>
			Folders keep their structure and upload as one quilt of up to 666 files.
			Up to 1 GiB per upload.
			{empty ? (
				<span className="drop-acts">
					<button
						className="btn btn-ink xs"
						type="button"
						onClick={pickers.openFolder}
					>
						Open folder
					</button>
					<button
						className="btn btn-soft xs"
						type="button"
						onClick={pickers.openFiles}
					>
						Add files
					</button>
				</span>
			) : null}
			{dropError ? (
				<span className="problem" role="alert">
					{dropError}
				</span>
			) : null}
		</div>
	);

	return (
		<section
			className={dragging ? "pane local dragging" : "pane local"}
			aria-labelledby="pane-local-title"
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
		>
			<div className="hd">
				<h3 id="pane-local-title">This computer</h3>
				<span className="crumb">
					{empty
						? "Nothing open"
						: `${groupThousands(String(files.length))} files`}
				</span>
				<div className="acts">
					<button
						className="btn btn-soft xs"
						type="button"
						onClick={pickers.openFolder}
					>
						Open folder
					</button>
				</div>
			</div>
			<div className="tools">
				<button
					className="btn btn-ghost xs"
					type="button"
					onClick={pickers.openFiles}
				>
					Add files
				</button>
				{chosen.length === files.length && !empty ? (
					<button
						className="btn btn-ghost xs"
						type="button"
						onClick={local.clearSelection}
					>
						Select none
					</button>
				) : (
					<button
						className="btn btn-ghost xs"
						type="button"
						disabled={empty}
						onClick={local.selectAll}
					>
						Select all
					</button>
				)}
				<button
					className="btn btn-ghost xs"
					type="button"
					disabled={chosen.length === 0}
					onClick={local.removeSelected}
				>
					Remove
				</button>
				<span className="sp" />
				<ViewToggle />
			</div>
			{empty ? (
				<div className="list">{dropZone}</div>
			) : (
				<LocalList
					rows={rows}
					selected={local.selected}
					onToggleSelected={local.toggle}
					onToggleFolder={local.toggleFolder}
					nowMs={nowMs}
					footer={dropZone}
				/>
			)}
			<div className="ft">
				<span>
					<b>{groupThousands(String(files.length))}</b>{" "}
					{files.length === 1 ? "file" : "files"}
				</span>
				{empty ? null : (
					<span>
						<b>{formatBytes(BigInt(totalBytes))}</b>
					</span>
				)}
				<span className="sp" />
				<span aria-live="polite">
					{chosen.length === 0
						? "Nothing selected"
						: `${groupThousands(String(chosen.length))} selected · ${formatBytes(BigInt(chosenBytes))}`}
				</span>
			</div>
		</section>
	);
}
