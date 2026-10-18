import {
	type KeyboardEvent,
	type MouseEvent,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import { hasReadablePatches } from "@/blobs/blob-row";
import { type QuiltPatches, UNREAD_PATCHES } from "@/blobs/quilt-patch-store";
import {
	ITEM_HEIGHT,
	type ListItem,
	layoutItems,
	parentKey,
} from "./list-items";
import { ListRow } from "./list-row";
import { useVisibleRange } from "./use-visible-range";

interface BlobListProps {
	label: string;
	items: readonly ListItem[];
	patches: ReadonlyMap<string, QuiltPatches>;
	selectedKey: string | null;
	onSelect: (key: string | null) => void;
	/** Expands or collapses a quilt, by object id. */
	onToggle: (objectId: string) => void;
	onRetryPatches: (blobId: string) => void;
	nowMs: number;
}

const COLUMNS: readonly { key: string; label: string; className: string }[] = [
	{ key: "name", label: "Name", className: "nm" },
	{ key: "size", label: "Size", className: "sz" },
	{ key: "expiry", label: "Expires", className: "ex" },
	{ key: "status", label: "Status", className: "st" },
];

/**
 * The wallet's blobs as a tree grid: quilts expand to their patches. One tab
 * stop; arrow keys move the selection, Right and Left open and close quilts,
 * Home and End jump. Only the rows on screen are rendered.
 */
export function BlobList({
	label,
	items,
	patches,
	selectedKey,
	onSelect,
	onToggle,
	onRetryPatches,
	nowMs,
}: BlobListProps) {
	const ids = useId();
	const scroller = useRef<HTMLDivElement>(null);
	const header = useRef<HTMLTableSectionElement>(null);
	const { tops, height } = useMemo(() => layoutItems(items), [items]);
	const { start, end } = useVisibleRange(scroller, tops);
	const selectedIndex = items.findIndex((item) => item.key === selectedKey);
	const rowId = (key: string) => `${ids}-${key}`;
	// Set when the keyboard moves the selection, so only that scrolls the list.
	const revealSelection = useRef(false);

	// Bring a row the keyboard moved to into view, below the sticky header.
	useLayoutEffect(() => {
		if (!revealSelection.current) return;
		revealSelection.current = false;
		const element = scroller.current;
		const top = tops[selectedIndex];
		const item = items[selectedIndex];
		if (!element || top === undefined || !item) return;
		const headerHeight = header.current?.offsetHeight ?? 0;
		const bottom = top + ITEM_HEIGHT[item.kind];
		if (top < element.scrollTop) element.scrollTop = top;
		else if (headerHeight + bottom > element.scrollTop + element.clientHeight)
			element.scrollTop = headerHeight + bottom - element.clientHeight;
	}, [selectedIndex, tops, items]);

	function move(index: number) {
		const item = items[Math.max(0, Math.min(items.length - 1, index))];
		if (!item) return;
		revealSelection.current = true;
		onSelect(item.key);
	}

	function onKeyDown(event: KeyboardEvent<HTMLTableElement>) {
		// Keys typed into a control inside the grid (a Retry button) stay with it.
		if (event.target !== event.currentTarget) return;
		const item = items[selectedIndex];
		const page = Math.max(
			1,
			Math.floor((scroller.current?.clientHeight ?? 0) / ITEM_HEIGHT.blob) - 1,
		);
		switch (event.key) {
			case "ArrowDown":
				move(item ? selectedIndex + 1 : 0);
				break;
			case "ArrowUp":
				move(item ? selectedIndex - 1 : 0);
				break;
			case "PageDown":
				move(item ? selectedIndex + page : 0);
				break;
			case "PageUp":
				move(item ? selectedIndex - page : 0);
				break;
			case "Home":
				move(0);
				break;
			case "End":
				move(items.length - 1);
				break;
			case "ArrowRight":
				if (item?.kind !== "blob" || item.expanded === null) return;
				if (item.expanded) move(selectedIndex + 1);
				else onToggle(item.key);
				break;
			case "ArrowLeft":
				if (!item) return;
				if (item.kind !== "blob")
					move(items.findIndex((other) => other.key === parentKey(item)));
				else if (item.expanded) onToggle(item.key);
				else return;
				break;
			case "Enter":
				if (item?.kind !== "blob" || item.expanded === null) return;
				onToggle(item.key);
				break;
			case "Escape":
				if (!item) return;
				onSelect(null);
				break;
			default:
				return;
		}
		event.preventDefault();
	}

	function rowAt(event: MouseEvent<HTMLTableElement>): ListItem | undefined {
		if (!(event.target instanceof Element)) return undefined;
		if (event.target.closest("button")) return undefined;
		const key = event.target.closest("tr")?.dataset.key;
		return items.find((item) => item.key === key);
	}

	function onClick(event: MouseEvent<HTMLTableElement>) {
		const item = rowAt(event);
		if (!item) return;
		onSelect(item.key);
		event.currentTarget.focus({ preventScroll: true });
		if (isOnToggle(event.target) && item.kind === "blob") onToggle(item.key);
	}

	function onDoubleClick(event: MouseEvent<HTMLTableElement>) {
		const item = rowAt(event);
		// A double click on the triangle already toggled twice through onClick.
		if (
			item?.kind === "blob" &&
			item.expanded !== null &&
			!isOnToggle(event.target)
		)
			onToggle(item.key);
	}

	const activeInWindow = selectedIndex >= start && selectedIndex < end;
	return (
		<div className="list" ref={scroller}>
			<table
				className="blist"
				// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a table with role treegrid is the WAI-ARIA APG tree grid pattern.
				role="treegrid"
				aria-label={label}
				aria-rowcount={items.length + 1}
				aria-activedescendant={
					activeInWindow && selectedKey !== null
						? rowId(selectedKey)
						: undefined
				}
				tabIndex={0}
				onKeyDown={onKeyDown}
				onClick={onClick}
				onDoubleClick={onDoubleClick}
			>
				<thead ref={header}>
					<tr className="row h" aria-rowindex={1}>
						<th scope="col">
							<span className="sr-only">Type</span>
						</th>
						{COLUMNS.map((column) => (
							<th key={column.key} scope="col" className={column.className}>
								{column.label}
							</th>
						))}
					</tr>
				</thead>
				<tbody
					style={{
						paddingTop: tops[start] ?? 0,
						paddingBottom: height - (tops[end] ?? height),
					}}
				>
					{items.slice(start, end).map((item, offset) => (
						<ListRow
							key={item.key}
							item={item}
							id={rowId(item.key)}
							rowIndex={start + offset + 2}
							selected={item.key === selectedKey}
							patchCount={
								item.kind === "blob" && hasReadablePatches(item.row)
									? (patches.get(item.row.blob.blobId) ?? UNREAD_PATCHES).count
									: null
							}
							nowMs={nowMs}
							onRetryPatches={onRetryPatches}
						/>
					))}
				</tbody>
			</table>
		</div>
	);
}

/** Whether a click landed on a quilt's disclosure triangle. */
function isOnToggle(target: EventTarget): boolean {
	return target instanceof Element && target.closest("[data-toggle]") !== null;
}
