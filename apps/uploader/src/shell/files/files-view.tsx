import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { hasReadablePatches } from "@/blobs/blob-row";
import {
	type BlobFilter,
	filterCounts,
	filterRows,
	type MorseMarks,
} from "@/blobs/filter-rows";
import type { ListedBlobs } from "@/blobs/list-blobs";
import { type RowSort, type SortKey, sortRows } from "@/blobs/sort-rows";
import type { BlobListing } from "@/blobs/use-blob-listing";
import { useQuiltPatches } from "@/blobs/use-quilt-patches";
import { errorMessage } from "@/lib/error-message";
import type { ChainRead } from "@/lib/use-chain-read";
import type { NetworkConfig } from "@/network/networks";
import { BulkBar, type BulkSheetKind } from "../bulk/bulk-bar";
import { EmptyState } from "../empty-state";
import {
	Inspector,
	type InspectorContext,
	type InspectorRequest,
} from "../inspector/inspector";
import { inspectorTarget } from "../inspector/inspector-target";
import { FILE_FILTER_CONFIG } from "./file-filters";
import { FileGrid } from "./file-grid";
import { FileList } from "./file-list";
import { type FilesLayout, FilterBar } from "./filter-bar";
import { buildListItems } from "./list-items";
import { type InspectorAsk, RowMenu } from "./row-menu";
import {
	type Selection,
	selectedRows,
	selectionInView,
	setSelected,
	toggleSelected,
} from "./selection";

const PLACEHOLDER_ROWS = [1, 2, 3, 4, 5, 6] as const;

interface FilesViewProps {
	network: NetworkConfig;
	address: string | null;
	filter: BlobFilter;
	query: string;
	onQueryChange: (query: string) => void;
	sort: RowSort;
	onSort: (sort: RowSort) => void;
	onSortBy: (key: SortKey) => void;
	layout: FilesLayout;
	onLayout: (layout: FilesLayout) => void;
	listing: ChainRead<BlobListing>;
	/** The listing with statuses computed, once it is read. */
	listed: ListedBlobs | null;
	marks: MorseMarks;
	/** Why the Published or Shared count is missing, when it is. */
	countNotes: Readonly<Partial<Record<BlobFilter, string | undefined>>>;
	onRefresh: () => void;
	onConnect: () => void;
	inspector: InspectorContext;
	/** Opens Extend everything expiring. */
	onExtendExpiring: () => void;
	/** The selected blobs, which survive filter and search changes. */
	selection: Selection;
	onSelectionChange: (change: (current: Selection) => Selection) => void;
	/** Opens a bulk action's sheet for the selection. */
	onBulk: (sheet: BulkSheetKind) => void;
	/** A blob to select and show, from the command palette; `request` grows with each jump. */
	jump: FilesJump | null;
}

/** A jump to a blob: select it, open the inspector (optionally at an action) and scroll to it. */
export interface FilesJump {
	objectId: string;
	ask: InspectorAsk | null;
	request: number;
}

/**
 * Files (design/v2/app.html): the wallet's blobs on the current network,
 * read from chain, with filter chips, sort, a list or grid, quilts that
 * open in place, a selection with the bulk bar, and an overflow menu per
 * row. A row's details open in the inspector beside the list. Open quilts
 * belong to one wallet and network; the shell remounts the view when
 * either changes, and keeps the selection per wallet and network.
 */
export function FilesView({
	network,
	address,
	filter,
	query,
	onQueryChange,
	sort,
	onSort,
	onSortBy,
	layout,
	onLayout,
	listing,
	listed,
	marks,
	countNotes,
	onRefresh,
	onConnect,
	inspector,
	onExtendExpiring,
	selection,
	onSelectionChange,
	onBulk,
	jump,
}: FilesViewProps) {
	const { store, patches } = useQuiltPatches();
	const view = useRef<HTMLElement>(null);
	const [activeKey, setActiveKey] = useState<string | null>(null);
	// Activating a row opens the inspector; closing it keeps the row active.
	const [inspectorOpen, setInspectorOpen] = useState(false);
	const [request, setRequest] = useState<InspectorRequest | null>(null);
	// The row to scroll into view: set by a jump, read by the list.
	const [reveal, setReveal] = useState<{
		key: string;
		request: number;
	} | null>(null);
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
	const [menu, setMenu] = useState<{
		key: string;
		anchor: HTMLButtonElement;
	} | null>(null);

	const rows = useMemo(
		() =>
			listed
				? sortRows(filterRows(listed.rows, filter, query, marks), sort)
				: [],
		[listed, filter, query, marks, sort],
	);
	const counts = useMemo(
		() => filterCounts(listed?.rows ?? [], marks),
		[listed, marks],
	);
	const items = useMemo(
		() => buildListItems(rows, expanded, patches),
		[rows, expanded, patches],
	);
	const active = items.find((item) => item.key === activeKey) ?? null;
	const menuItem = menu
		? (items.find((item) => item.key === menu.key) ?? null)
		: null;

	function activate(key: string | null) {
		setActiveKey(key);
		setInspectorOpen(key !== null);
		setRequest(null);
	}

	function openDetails(key: string, ask: InspectorAsk | null) {
		setActiveKey(key);
		setInspectorOpen(true);
		setRequest(
			ask === null
				? null
				: (current) => ({ ...ask, request: (current?.request ?? 0) + 1 }),
		);
	}

	function closeInspector() {
		setInspectorOpen(false);
		view.current?.querySelector<HTMLElement>(".tbl")?.focus();
	}

	function closeMenu(restoreFocus: boolean) {
		const anchor = menu?.anchor;
		setMenu(null);
		if (restoreFocus) anchor?.focus();
	}

	// A jump from the palette selects the blob, opens the inspector and
	// scrolls the list to it; each request is handled once.
	const handledJump = useRef(0);
	useEffect(() => {
		if (jump === null || jump.request === handledJump.current) return;
		handledJump.current = jump.request;
		setActiveKey(jump.objectId);
		setInspectorOpen(true);
		setRequest((current) =>
			jump.ask === null
				? null
				: { ...jump.ask, request: (current?.request ?? 0) + 1 },
		);
		setReveal({ key: jump.objectId, request: jump.request });
	}, [jump]);

	function check(objectId: string) {
		onSelectionChange((current) => toggleSelected(current, objectId));
	}

	// The header box selects or clears what the view lists; hidden selections stay.
	function checkAll(on: boolean) {
		onSelectionChange((current) =>
			setSelected(
				current,
				rows.map((row) => row.blob.objectId),
				on,
			),
		);
	}

	// File counts show on quilt rows, so every readable quilt's index is read
	// once the list arrives; the store skips quilts it has already read.
	useEffect(() => {
		for (const row of listed?.rows ?? []) {
			if (hasReadablePatches(row)) store.readCount(row.blob.blobId);
		}
	}, [listed, store]);

	function toggleQuilt(objectId: string) {
		const quilt = listed?.rows.find((row) => row.blob.objectId === objectId);
		if (!quilt) return;
		const next = new Set(expanded);
		if (next.delete(objectId)) {
			// Collapsing hides the quilt's files; keep the quilt active.
			if (activeKey?.startsWith(`${objectId}:`)) setActiveKey(objectId);
		} else {
			next.add(objectId);
			store.readIdentifiers(quilt.blob.blobId);
		}
		setExpanded(next);
	}

	function refresh() {
		onRefresh();
		for (const [blobId, quilt] of patches) {
			if (
				quilt.count.status === "error" ||
				quilt.identifiers.status === "error"
			)
				store.retry(blobId);
		}
	}

	const busy =
		listing.status === "loading" ||
		(listing.status === "ready" && listing.refreshing);
	const config = FILE_FILTER_CONFIG[filter];
	const label = `${config.label} on ${network.walrusLabel}`;

	let content: ReactNode;
	if (address === null) {
		content = (
			<EmptyState
				icon="wallet"
				title="Connect a wallet"
				action={
					<button className="btn solid" type="button" onClick={onConnect}>
						Connect wallet
					</button>
				}
			>
				Your blobs on {network.walrusLabel} appear here. Morse Uploader never
				holds your keys; your wallet signs every transaction.
			</EmptyState>
		);
	} else if (listing.status === "error") {
		content = (
			<EmptyState
				icon="alert"
				title="Could not read your blobs"
				action={
					<button className="btn solid" type="button" onClick={refresh}>
						Try again
					</button>
				}
			>
				{errorMessage(listing.error)}
			</EmptyState>
		);
	} else if (listed === null) {
		content = (
			<div className="tbl" aria-busy="true">
				<p className="sr-only" role="status">
					Reading your blobs on {network.walrusLabel} from chain…
				</p>
				{PLACEHOLDER_ROWS.map((row) => (
					<div key={row} className="tr skel" aria-hidden="true">
						<i />
						<i />
						<i />
						<i />
					</div>
				))}
			</div>
		);
	} else if (rows.length === 0) {
		content = (
			<NothingListed
				filter={filter}
				hasBlobs={listed.rows.length > 0}
				query={query.trim()}
				note={counts[filter] === null ? (countNotes[filter] ?? null) : null}
				networkLabel={network.walrusLabel}
				onClearQuery={() => onQueryChange("")}
			/>
		);
	} else if (layout === "grid") {
		content = (
			<FileGrid
				label={label}
				rows={rows}
				activeKey={activeKey}
				onActivate={activate}
				checked={selection}
				onCheck={check}
				onMenu={(key, anchor) => setMenu({ key, anchor })}
				reveal={reveal}
			/>
		);
	} else {
		content = (
			<FileList
				label={label}
				items={items}
				patches={patches}
				sort={sort}
				onSort={onSortBy}
				activeKey={activeKey}
				onActivate={activate}
				checked={selection}
				onCheck={check}
				onCheckAll={checkAll}
				onMenu={(key, anchor) => setMenu({ key, anchor })}
				onToggle={toggleQuilt}
				onRetryPatches={store.retry}
				scroller={view}
				reveal={reveal}
				nowMs={listed.nowMs}
			/>
		);
	}

	const showInspector = inspectorOpen && active !== null && listed !== null;
	return (
		<div className={showInspector ? "content with-insp" : "content"}>
			<section className="view" ref={view} aria-label="Files">
				<FilterBar
					filter={filter}
					counts={counts}
					countNotes={countNotes}
					query={query}
					onQueryChange={onQueryChange}
					queryDisabled={listed === null || listed.rows.length === 0}
					sort={sort}
					onSort={onSort}
					layout={layout}
					onLayout={onLayout}
					refreshing={busy || address === null}
					onRefresh={refresh}
					extendExpiring={
						filter === "expiring" &&
						(counts.expiring ?? 0) > 0 &&
						inspector.actions
							? onExtendExpiring
							: null
					}
				/>
				{content}
			</section>
			{selection.size > 0 && listed !== null ? (
				<BulkBar
					network={network}
					rows={selectedRows(selection, listed.rows)}
					hidden={selectionInView(selection, rows).hidden}
					clock={listed.clock}
					storagePricePerUnit={
						inspector.prices.status === "ready"
							? inspector.prices.data.storagePerUnit
							: null
					}
					canSign={inspector.actions !== null}
					onOpen={onBulk}
					onClear={() => onSelectionChange(() => new Set())}
				/>
			) : null}
			{showInspector ? (
				<Inspector
					key={active.key}
					target={inspectorTarget(active)}
					network={network}
					listed={listed}
					context={inspector}
					request={request}
					onClose={closeInspector}
				/>
			) : null}
			{menu && menuItem ? (
				<RowMenu
					target={inspectorTarget(menuItem)}
					anchor={menu.anchor}
					network={network}
					onOpen={(ask) => {
						setMenu(null);
						openDetails(menu.key, ask);
					}}
					onClose={closeMenu}
				/>
			) : null}
		</div>
	);
}

/** Why the list is empty: no blobs at all, none in this filter, none matching, or a count that cannot be made. */
function NothingListed({
	filter,
	hasBlobs,
	query,
	note,
	networkLabel,
	onClearQuery,
}: {
	filter: BlobFilter;
	hasBlobs: boolean;
	query: string;
	/** Why the filter's marks are unknown, when they are. */
	note: string | null;
	networkLabel: string;
	onClearQuery: () => void;
}) {
	const config = FILE_FILTER_CONFIG[filter];
	if (query !== "") {
		return (
			<EmptyState
				icon="search"
				title={`No blobs match “${query}”`}
				action={
					<button className="btn" type="button" onClick={onClearQuery}>
						Clear search
					</button>
				}
			>
				Search looks at names, blob ids and object ids in {config.label}.
			</EmptyState>
		);
	}
	if (!hasBlobs && filter === "all") {
		return (
			<EmptyState icon="folder" title={`No blobs on ${networkLabel}`}>
				This wallet owns no Walrus blobs on {networkLabel}. Blobs it uploads
				appear here, with their storage clock.
			</EmptyState>
		);
	}
	if (note !== null) {
		return (
			<EmptyState icon={config.icon} title={config.label}>
				{note}
			</EmptyState>
		);
	}
	return (
		<EmptyState icon={config.icon} title={config.emptyTitle}>
			{config.empty}
		</EmptyState>
	);
}
