import { type ReactNode, useMemo, useRef } from "react";
import { fileIcon } from "@/components/file-icon";
import { Icon } from "@/components/icon";
import { formatBytes } from "@/lib/format-bytes";
import { formatModified } from "@/lib/format-date";
import { groupThousands } from "@/lib/group-thousands";
import {
	LOCAL_ROW_HEIGHT,
	type LocalRow,
	selectionOf,
} from "@/local/local-tree";
import { useVisibleRange } from "../blob-list/use-visible-range";

interface LocalListProps {
	rows: readonly LocalRow[];
	selected: ReadonlySet<string>;
	onToggleSelected: (fileIds: readonly string[], on: boolean) => void;
	onToggleFolder: (key: string) => void;
	nowMs: number;
	/** Shown after the rows: the drop zone. */
	footer: ReactNode;
}

/**
 * Dropped and picked files as a tree. Each row has a checkbox; a folder's
 * selects every file under it and shows mixed when some are selected. Only
 * the rows on screen are rendered, so a large folder scrolls smoothly.
 */
export function LocalList({
	rows,
	selected,
	onToggleSelected,
	onToggleFolder,
	nowMs,
	footer,
}: LocalListProps) {
	const scroller = useRef<HTMLDivElement>(null);
	const { tops, height } = useMemo(() => {
		const offsets: number[] = [];
		let y = 0;
		for (const row of rows) {
			offsets.push(y);
			y += LOCAL_ROW_HEIGHT[row.kind];
		}
		return { tops: offsets, height: y };
	}, [rows]);
	const { start, end } = useVisibleRange(scroller, tops);

	return (
		<div className="list" ref={scroller}>
			<div className="row h lhead" aria-hidden="true">
				<span />
				<span />
				<span>Name</span>
				<span>Size</span>
				<span>Modified</span>
			</div>
			<ul
				className="llist"
				aria-label="Files on this computer"
				style={{
					paddingTop: tops[start] ?? 0,
					paddingBottom: height - (tops[end] ?? height),
				}}
			>
				{rows.slice(start, end).map((row) => (
					<LocalRowView
						key={row.key}
						row={row}
						selected={selected}
						onToggleSelected={onToggleSelected}
						onToggleFolder={onToggleFolder}
						nowMs={nowMs}
					/>
				))}
			</ul>
			{footer}
		</div>
	);
}

function LocalRowView({
	row,
	selected,
	onToggleSelected,
	onToggleFolder,
	nowMs,
}: {
	row: LocalRow;
	selected: ReadonlySet<string>;
	onToggleSelected: (fileIds: readonly string[], on: boolean) => void;
	onToggleFolder: (key: string) => void;
	nowMs: number;
}) {
	const indent = { paddingLeft: row.depth * 16 };
	if (row.kind === "folder") {
		const state = selectionOf(row.fileIds, selected);
		return (
			<li className="row lrow" style={{ height: LOCAL_ROW_HEIGHT.folder }}>
				<input
					type="checkbox"
					checked={state === "all"}
					ref={(node) => {
						if (node) node.indeterminate = state === "some";
					}}
					aria-label={`Select ${row.name}/, ${row.fileIds.length} files`}
					onChange={(event) =>
						onToggleSelected(row.fileIds, event.currentTarget.checked)
					}
				/>
				<span className="ico dir" style={indent}>
					<Icon name="folder" />
				</span>
				<button
					type="button"
					className="nm open"
					aria-expanded={row.expanded}
					onClick={() => onToggleFolder(row.key)}
				>
					<span className="tw" aria-hidden="true">
						<Icon name="chevron" size={12} />
					</span>
					<span className="label">
						{row.name}/
						<small>
							{groupThousands(String(row.fileIds.length))}{" "}
							{row.fileIds.length === 1 ? "file" : "files"}
						</small>
					</span>
				</button>
				<span
					className="sz"
					title={`${groupThousands(String(row.size))} bytes`}
				>
					{formatBytes(BigInt(row.size))}
				</span>
				<span className="dt" />
			</li>
		);
	}
	const { file } = row;
	const id = `local-${file.id}`;
	return (
		<li className="row lrow" style={{ height: LOCAL_ROW_HEIGHT.file }}>
			<input
				id={id}
				type="checkbox"
				checked={selected.has(file.id)}
				onChange={(event) =>
					onToggleSelected([file.id], event.currentTarget.checked)
				}
			/>
			<span className="ico" style={indent}>
				<Icon name={fileIcon(file.name)} />
			</span>
			<label className="nm" htmlFor={id} title={file.path}>
				{file.name}
			</label>
			<span className="sz" title={`${groupThousands(String(file.size))} bytes`}>
				{formatBytes(BigInt(file.size))}
			</span>
			<span className="dt">{formatModified(file.lastModified, nowMs)}</span>
		</li>
	);
}
