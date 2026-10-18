import {
	type KeyboardEvent,
	type MouseEvent,
	type RefObject,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import { hasReadablePatches } from "@/blobs/blob-row";
import { type QuiltPatches, UNREAD_PATCHES } from "@/blobs/quilt-patch-store";
import type { RowSort, SortKey } from "@/blobs/sort-rows";
import { Icon } from "@/components/icon";
import { FileRow } from "./file-row";
import {
	ITEM_HEIGHT,
	type ListItem,
	layoutItems,
	parentKey,
} from "./list-items";
import { offsetIn, useVisibleRange } from "./use-visible-range";

interface FileListProps {
	label: string;
	items: readonly ListItem[];
	patches: ReadonlyMap<string, QuiltPatches>;
	sort: RowSort;
	onSort: (key: SortKey) => void;
	activeKey: string | null;
	onActivate: (key: string | null) => void;
	checked: ReadonlySet<string>;
	onCheck: (objectId: string) => void;
	onCheckAll: (check: boolean) => void;
	onMenu: (key: string, trigger: HTMLButtonElement) => void;
	/** Expands or collapses a quilt, by object id. */
	onToggle: (objectId: string) => void;
	onRetryPatches: (blobId: string) => void;
	/** The element that scrolls the list: the view. */
	scroller: RefObject<HTMLElement | null>;
	/** A row to scroll into view, from a jump; `request` grows with each. */
	reveal: { key: string; request: number } | null;
	nowMs: number;
}

const COLUMNS: readonly { key: SortKey; label: string }[] = [
	{ key: "name", label: "Name" },
	{ key: "size", label: "Size" },
	{ key: "uploaded", label: "Uploaded" },
	{ key: "expiry", label: "Storage left" },
];

/**
 * The wallet's blobs as a tree grid: quilts open in place to their files.
 * One tab stop for the rows; arrow keys move the active row, Right and Left
 * open and close quilts, Home and End jump, Space checks the row and
 * Shift+F10 opens its actions. Only the rows on screen render.
 */
export function FileList({
	label,
	items,
	patches,
	sort,
	onSort,
	activeKey,
	onActivate,
	checked,
	onCheck,
	onCheckAll,
	onMenu,
	onToggle,
	onRetryPatches,
	scroller,
	reveal,
	nowMs,
}: FileListProps) {
	const ids = useId();
	const body = useRef<HTMLTableSectionElement>(null);
	const { tops, height } = useMemo(() => layoutItems(items), [items]);
	const { start, end } = useVisibleRange(scroller, body, tops);
	const activeIndex = items.findIndex((item) => item.key === activeKey);
	const rowId = (key: string) => `${ids}-${key}`;
	// Set when the keyboard moves the active row, so only that scrolls the view.
	const revealActive = useRef(false);
	const blobs = items.filter((item) => item.kind === "blob");
	const checkedCount = blobs.filter((item) => checked.has(item.key)).length;

	useLayoutEffect(() => {
		if (!revealActive.current) return;
		revealActive.current = false;
		const view = scroller.current;
		const top = tops[activeIndex];
		const item = items[activeIndex];
		if (!view || top === undefined || !item) return;
		const rowTop = offsetIn(body.current, view) + top;
		const rowBottom = rowTop + ITEM_HEIGHT[item.kind];
		if (rowTop < view.scrollTop) view.scrollTop = rowTop;
		else if (rowBottom > view.scrollTop + view.clientHeight)
			view.scrollTop = rowBottom - view.clientHeight;
	}, [activeIndex, tops, items, scroller]);

	// A jump scrolls its row to the middle of the view and focuses the grid.
	const revealed = useRef(0);
	useLayoutEffect(() => {
		if (reveal === null || reveal.request === revealed.current) return;
		const index = items.findIndex((item) => item.key === reveal.key);
		const view = scroller.current;
		const top = tops[index];
		if (!view || top === undefined) return;
		revealed.current = reveal.request;
		const rowTop = offsetIn(body.current, view) + top;
		view.scrollTop = Math.max(0, rowTop - view.clientHeight / 2);
		body.current?.closest<HTMLElement>("table")?.focus({ preventScroll: true });
	}, [reveal, items, tops, scroller]);

	function move(index: number) {
		const item = items[Math.max(0, Math.min(items.length - 1, index))];
		if (!item) return;
		revealActive.current = true;
		onActivate(item.key);
	}

	function onKeyDown(event: KeyboardEvent<HTMLTableElement>) {
		// Keys typed into a control inside the grid (a Try again button) stay with it.
		if (event.target !== event.currentTarget) return;
		const item = items[activeIndex];
		const page = Math.max(
			1,
			Math.floor((scroller.current?.clientHeight ?? 0) / ITEM_HEIGHT.blob) - 1,
		);
		switch (event.key) {
			case "ArrowDown":
				move(item ? activeIndex + 1 : 0);
				break;
			case "ArrowUp":
				move(item ? activeIndex - 1 : 0);
				break;
			case "PageDown":
				move(item ? activeIndex + page : 0);
				break;
			case "PageUp":
				move(item ? activeIndex - page : 0);
				break;
			case "Home":
				move(0);
				break;
			case "End":
				move(items.length - 1);
				break;
			case "ArrowRight":
				if (item?.kind !== "blob" || item.expanded === null) return;
				if (item.expanded) move(activeIndex + 1);
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
			case " ":
				if (item?.kind !== "blob") return;
				onCheck(item.key);
				break;
			case "F10":
			case "ContextMenu": {
				if (event.key === "F10" && !event.shiftKey) return;
				const trigger = document
					.getElementById(rowId(item?.key ?? ""))
					?.querySelector<HTMLButtonElement>(".more");
				if (!item || !trigger) return;
				onMenu(item.key, trigger);
				break;
			}
			case "Escape":
				if (!item) return;
				onActivate(null);
				break;
			default:
				return;
		}
		event.preventDefault();
	}

	function rowAt(event: MouseEvent<HTMLTableElement>): ListItem | undefined {
		if (!(event.target instanceof Element)) return undefined;
		if (event.target.closest("button, input, a")) return undefined;
		const key = event.target.closest<HTMLElement>("[data-key]")?.dataset.key;
		return items.find((item) => item.key === key);
	}

	function onClick(event: MouseEvent<HTMLTableElement>) {
		const item = rowAt(event);
		if (!item) return;
		onActivate(item.key);
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

	const activeInWindow = activeIndex >= start && activeIndex < end;
	return (
		<table
			className="tbl"
			// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a table with role treegrid is the WAI-ARIA APG tree grid pattern.
			role="treegrid"
			aria-label={label}
			aria-rowcount={items.length + 1}
			aria-activedescendant={
				activeInWindow && activeKey !== null ? rowId(activeKey) : undefined
			}
			aria-keyshortcuts="Space Shift+F10"
			tabIndex={0}
			onKeyDown={onKeyDown}
			onClick={onClick}
			onDoubleClick={onDoubleClick}
		>
			<thead>
				<tr className="tr h" aria-rowindex={1}>
					<th scope="col" className="cbc">
						<input
							type="checkbox"
							className="cb"
							checked={blobs.length > 0 && checkedCount === blobs.length}
							ref={(box) => {
								if (box)
									box.indeterminate =
										checkedCount > 0 && checkedCount < blobs.length;
							}}
							aria-label="Select every listed blob"
							onChange={(event) => onCheckAll(event.currentTarget.checked)}
						/>
					</th>
					<th scope="col" className="icc">
						<span className="sr-only">Type</span>
					</th>
					{COLUMNS.map((column) => {
						const sorted = sort.key === column.key;
						return (
							<th
								key={column.key}
								scope="col"
								aria-sort={sorted ? sort.direction : undefined}
							>
								<button
									type="button"
									className={sorted ? `sort on ${sort.direction}` : "sort"}
									onClick={() => onSort(column.key)}
								>
									{column.label}
									<Icon name="arrowUp" size={10} />
								</button>
							</th>
						);
					})}
					<th scope="col" className="mc">
						<span className="sr-only">Actions</span>
					</th>
				</tr>
			</thead>
			<tbody
				ref={body}
				style={{
					paddingTop: tops[start] ?? 0,
					paddingBottom: height - (tops[end] ?? height),
				}}
			>
				{items.slice(start, end).map((item, offset) => (
					<FileRow
						key={item.key}
						item={item}
						id={rowId(item.key)}
						rowIndex={start + offset + 2}
						active={item.key === activeKey}
						checked={item.kind === "blob" && checked.has(item.key)}
						patchCount={
							item.kind === "blob" && hasReadablePatches(item.row)
								? (patches.get(item.row.blob.blobId) ?? UNREAD_PATCHES).count
								: null
						}
						nowMs={nowMs}
						onCheck={onCheck}
						onMenu={onMenu}
						onRetryPatches={onRetryPatches}
					/>
				))}
			</tbody>
		</table>
	);
}

/** Whether a click landed on a quilt's disclosure triangle. */
function isOnToggle(target: EventTarget): boolean {
	return target instanceof Element && target.closest("[data-toggle]") !== null;
}
