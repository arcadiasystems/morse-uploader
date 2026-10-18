import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { hasReadablePatches } from "@/blobs/blob-row";
import { filterRows } from "@/blobs/filter-rows";
import type { ListedBlobs } from "@/blobs/list-blobs";
import { type RowSort, type SortKey, sortRows } from "@/blobs/sort-rows";
import type { BlobListing } from "@/blobs/use-blob-listing";
import { useQuiltPatches } from "@/blobs/use-quilt-patches";
import type { WalrusPrices } from "@/funds/types";
import { errorMessage } from "@/lib/error-message";
import { shortenAddress } from "@/lib/shorten-address";
import type { ChainRead } from "@/lib/use-chain-read";
import type { NetworkConfig } from "@/network/networks";
import { BlobActions } from "../blob-list/blob-actions";
import { BlobFooter } from "../blob-list/blob-footer";
import { BlobList } from "../blob-list/blob-list";
import { buildListItems } from "../blob-list/list-items";
import { ListSkeleton } from "../blob-list/list-skeleton";
import { BLOB_VIEWS, type BlobView } from "../blob-views";
import {
	BlobDrawer,
	type DrawerContext,
	type DrawerSection,
} from "../drawer/blob-drawer";
import { drawerTarget } from "../drawer/drawer-target";
import { EmptyState } from "../empty-state";
import { PriceFooter } from "./price-footer";
import { ViewToggle } from "./view-toggle";

interface WalrusPaneProps {
	network: NetworkConfig;
	address: string | null;
	view: BlobView;
	query: string;
	onClearQuery: () => void;
	sort: RowSort;
	onSort: (key: SortKey) => void;
	listing: ChainRead<BlobListing>;
	/** The listing with statuses computed, once it is read. */
	listed: ListedBlobs | null;
	onRefresh: () => void;
	prices: ChainRead<WalrusPrices>;
	onConnect: () => void;
	drawer: DrawerContext;
	/** Opens Extend all for the blobs expiring soon. */
	onExtendExpiring: () => void;
}

/**
 * The wallet's blobs on the current network, read from chain. Selection and
 * open quilts belong to one wallet and network; the shell remounts the pane
 * when either changes.
 */
export function WalrusPane({
	network,
	address,
	view,
	query,
	onClearQuery,
	sort,
	onSort,
	listing,
	listed,
	onRefresh,
	prices,
	onConnect,
	drawer,
	onExtendExpiring,
}: WalrusPaneProps) {
	const { store, patches } = useQuiltPatches();
	const pane = useRef<HTMLElement>(null);
	const [selectedKey, setSelectedKey] = useState<string | null>(null);
	// Selecting a row opens the drawer; closing it keeps the selection.
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [focus, setFocus] = useState<{
		section: DrawerSection;
		request: number;
	} | null>(null);
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
	const { filter } = BLOB_VIEWS[view];

	const rows = useMemo(
		() =>
			listed && filter
				? sortRows(filterRows(listed.rows, filter, query), sort)
				: [],
		[listed, filter, query, sort],
	);
	const items = useMemo(
		() => buildListItems(rows, expanded, patches),
		[rows, expanded, patches],
	);
	const selected = items.find((item) => item.key === selectedKey) ?? null;

	function select(key: string | null) {
		setSelectedKey(key);
		setDrawerOpen(key !== null);
		setFocus(null);
	}

	function openDrawer(section: DrawerSection) {
		setDrawerOpen(true);
		setFocus((current) => ({
			section,
			request: (current?.request ?? 0) + 1,
		}));
	}

	function closeDrawer() {
		setDrawerOpen(false);
		pane.current?.querySelector<HTMLElement>(".blist")?.focus();
	}

	// Patch counts show on quilt rows, so every readable quilt's index is read
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
			// Collapsing hides the quilt's patches; keep the selection on the quilt.
			if (selectedKey?.startsWith(`${objectId}:`)) setSelectedKey(objectId);
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
	const readState = address === null ? prices.status : listing.status;
	const dot =
		readState === "ready" ? "ok" : readState === "error" ? "warn" : "wait";

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
		content = <ListSkeleton networkLabel={network.walrusLabel} />;
	} else if (filter === null || rows.length === 0) {
		content = (
			<NothingListed
				view={view}
				hasBlobs={listed.rows.length > 0}
				query={filter === null ? "" : query.trim()}
				networkLabel={network.walrusLabel}
				onClearQuery={onClearQuery}
			/>
		);
	} else {
		content = (
			<BlobList
				label={`${BLOB_VIEWS[view].label} on ${network.walrusLabel}`}
				items={items}
				patches={patches}
				sort={sort}
				onSort={onSort}
				selectedKey={selectedKey}
				onSelect={select}
				onToggle={toggleQuilt}
				onRetryPatches={store.retry}
				nowMs={listed.nowMs}
			/>
		);
	}

	return (
		<section
			className="pane remote"
			aria-labelledby="pane-walrus-title"
			ref={pane}
		>
			<div className="hd">
				<h3 id="pane-walrus-title">
					<i className={dot} aria-hidden="true" />
					{network.walrusLabel}
				</h3>
				<span className="crumb">
					{address ? shortenAddress(address) : "Not connected"} /{" "}
					<b>{BLOB_VIEWS[view].label}</b>
				</span>
				<div className="acts">
					<button
						className="btn sm"
						type="button"
						disabled={address === null || listing.status === "loading"}
						aria-busy={busy}
						onClick={refresh}
					>
						{busy ? "Refreshing…" : "Refresh"}
					</button>
				</div>
			</div>
			<div className="tools">
				<BlobActions
					selected={selected}
					network={network}
					onOpen={openDrawer}
				/>
				<span className="sp" />
				<ViewToggle />
			</div>
			{content}
			{listed ? (
				<BlobFooter
					summary={listed.summary}
					selected={selected}
					onExtendExpiring={drawer.actions ? onExtendExpiring : null}
				/>
			) : (
				<PriceFooter prices={prices} />
			)}
			{drawerOpen && selected && listed ? (
				<BlobDrawer
					key={selected.key}
					target={drawerTarget(selected)}
					network={network}
					listed={listed}
					context={drawer}
					focus={focus}
					onClose={closeDrawer}
				/>
			) : null}
		</section>
	);
}

/** Why the list is empty: no blobs at all, none in this view, or none matching the search. */
function NothingListed({
	view,
	hasBlobs,
	query,
	networkLabel,
	onClearQuery,
}: {
	view: BlobView;
	hasBlobs: boolean;
	query: string;
	networkLabel: string;
	onClearQuery: () => void;
}) {
	const config = BLOB_VIEWS[view];
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
	if (!hasBlobs && view === "all") {
		return (
			<EmptyState icon="folder" title={`No blobs on ${networkLabel}`}>
				This wallet owns no Walrus blobs on {networkLabel}. Blobs it uploads
				appear here, with their status and expiry.
			</EmptyState>
		);
	}
	return (
		<EmptyState icon={config.icon} title={config.emptyTitle}>
			{config.empty}
		</EmptyState>
	);
}
