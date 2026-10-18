import { useCurrentNetwork } from "@mysten/dapp-kit-react";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useActivity } from "@/activity/use-activity";
import type { BlobRow } from "@/blobs/blob-row";
import {
	type BlobFilter,
	type MorseMarks,
	matchesFilter,
	matchesSearch,
} from "@/blobs/filter-rows";
import { type ListedBlobs, listBlobs } from "@/blobs/list-blobs";
import { publishedObjectIds, sharedObjectIds } from "@/blobs/morse-marks";
import { DEFAULT_SORT, nextSort, type RowSort } from "@/blobs/sort-rows";
import { useBlobListing } from "@/blobs/use-blob-listing";
import type { Balances } from "@/funds/types";
import { useFunds } from "@/funds/use-funds";
import { errorMessage } from "@/lib/error-message";
import { formatBytes } from "@/lib/format-bytes";
import { shortenAddress } from "@/lib/shorten-address";
import type { ChainRead } from "@/lib/use-chain-read";
import type { PickedFile } from "@/local/local-library";
import { usePickedFiles } from "@/local/use-picked-files";
import { useAutoExtend } from "@/manage/use-auto-extend";
import type { Publications } from "@/morse/read-publications";
import type { SharedFiles } from "@/morse/read-shared-files";
import { useMorseReads } from "@/morse/use-morse-reads";
import { NETWORKS, type NetworkConfig } from "@/network/networks";
import { summarizeTransfers } from "@/transfers/summarize-transfers";
import type { TransferBatch } from "@/transfers/transfer-job";
import { useTransferQueue } from "@/transfers/use-transfer-queue";
import { useSession } from "@/wallet/use-session";
import {
	useWalletActions,
	type WalletActions,
} from "@/wallet/use-wallet-actions";
import { useAppRoute } from "./app-route";
import { AutoExtendSheet } from "./auto-extend-sheet";
import type { BulkSheetKind } from "./bulk/bulk-bar";
import { BulkDeleteSheet } from "./bulk/bulk-delete-sheet";
import { BulkExtendSheet, type ExtendScope } from "./bulk/bulk-extend-sheet";
import { BulkPublishSheet } from "./bulk/bulk-publish-sheet";
import { BulkShareSheet } from "./bulk/bulk-share-sheet";
import { BulkVerifySheet } from "./bulk/bulk-verify-sheet";
import { DropOverlay } from "./drop/drop-overlay";
import { DropProblem } from "./drop/drop-problem";
import { useWindowDrop } from "./drop/use-window-drop";
import { useFilePickers } from "./file-pickers";
import { type FilesJump, FilesView } from "./files/files-view";
import type { FilesLayout } from "./files/filter-bar";
import {
	EMPTY_SELECTION,
	pruneSelection,
	type Selection,
	selectedRows,
} from "./files/selection";
import type { InspectorContext } from "./inspector/inspector";
import { Overview } from "./overview/overview";
import { CommandPalette } from "./palette/command-palette";
import { paletteCommands } from "./palette/palette-commands";
import type { BlobMatch } from "./palette/palette-match";
import { type GoTarget, useShortcuts } from "./palette/shortcuts";
import { Rail } from "./rail/rail";
import { Topbar } from "./topbar";
import { TransfersPanel } from "./transfers/transfers-panel";
import { UploadSheet } from "./upload-sheet/upload-sheet";
import { usePopover } from "./use-popover";

/**
 * The app shell: the rail, the top bar with search, transfers, balances and
 * Upload, the current view, and the sheets and slide-overs above them.
 */
export function Shell() {
	const network = NETWORKS[useCurrentNetwork()];
	const session = useSession();
	const address = session?.account.address ?? null;
	const funds = useFunds(network, address);
	const blobs = useBlobListing(network, address);
	const activity = useActivity(network, address);
	const morse = useMorseReads(network, address);
	const [route, navigate] = useAppRoute();
	const profileMenu = usePopover();
	const balanceMenu = usePopover();
	const transfersPanel = usePopover();
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<RowSort>(DEFAULT_SORT);
	const [layout, setLayout] = useState<FilesLayout>("list");
	const picked = usePickedFiles();
	// Each opening is a new session, so the sheet reads prices again.
	const [sheet, setSheet] = useState<{ session: number; open: boolean }>({
		session: 0,
		open: false,
	});
	const closeSheet = useCallback(
		() => setSheet((current) => ({ ...current, open: false })),
		[],
	);

	const refreshBlobs = blobs.refresh;
	const refreshFunds = funds.refresh;
	const refreshActivity = activity.refresh;
	const refreshMorse = morse.refresh;
	// After the app changes something on chain, everything shown reads again.
	const refreshChain = useCallback(() => {
		refreshBlobs();
		refreshFunds();
		refreshActivity();
		refreshMorse();
	}, [refreshBlobs, refreshFunds, refreshActivity, refreshMorse]);
	const transfers = useTransferQueue(network.id, address, refreshChain);
	const transfersSummary = summarizeTransfers(transfers.state);
	const actions = useWalletActions(network.id);
	// The bulk sheet open now: an action on the selection, or Extend everything expiring.
	const [bulk, setBulk] = useState<
		| { kind: Exclude<BulkSheetKind, "extend"> }
		| { kind: "extend"; scope: ExtendScope }
		| null
	>(null);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [autoExtendOpen, setAutoExtendOpen] = useState(false);
	const [jump, setJump] = useState<FilesJump | null>(null);
	// Set when Go to Expiry timeline needs the Overview to scroll to its card.
	const [timelineRequested, setTimelineRequested] = useState(false);
	// The selection belongs to one wallet and network.
	const selectionScope = `${network.id}:${address ?? ""}`;
	const [selectionOf, setSelectionOf] = useState<{
		scope: string;
		selected: Selection;
	}>({ scope: selectionScope, selected: EMPTY_SELECTION });

	function upload(files: PickedFile[]) {
		picked.replace(files);
		setSheet((current) => ({ session: current.session + 1, open: true }));
	}
	const pickers = useFilePickers(upload);
	const [dropProblem, setDropProblem] = useState<string | null>(null);
	const dragging = useWindowDrop({
		onFiles: (files) => {
			setDropProblem(null);
			// Staged files belong to a wallet: without one, the drop asks to connect.
			if (address === null) profileMenu.open();
			else upload(files);
		},
		onProblem: setDropProblem,
	});

	function confirmUpload(batch: TransferBatch) {
		transfers.queue.enqueue(batch);
		closeSheet();
		transfersPanel.open();
	}

	const listing = blobs.read;
	const listed = useMemo(
		() =>
			listing.status === "ready"
				? listBlobs(listing.data, listing.readAt.getTime())
				: null,
		[listing],
	);
	// Blobs that left the listing drop out of the selection.
	const selection =
		selectionOf.scope === selectionScope && listed
			? pruneSelection(selectionOf.selected, listed.rows)
			: EMPTY_SELECTION;
	const changeSelection = useCallback(
		(change: (current: Selection) => Selection) =>
			setSelectionOf((previous) => ({
				scope: selectionScope,
				selected: change(
					previous.scope === selectionScope
						? previous.selected
						: EMPTY_SELECTION,
				),
			})),
		[selectionScope],
	);
	const autoExtend = useAutoExtend({
		network,
		actions,
		listed,
		storagePricePerUnit:
			funds.prices.status === "ready" ? funds.prices.data.storagePerUnit : null,
		refreshBlobs,
		onRenewed: refreshChain,
	});
	const inspector: InspectorContext = {
		actions,
		balances: funds.balances,
		prices: funds.prices,
		autoExtend,
		onChanged: refreshChain,
	};
	const filter: BlobFilter = route.view === "files" ? route.filter : "all";
	const publications =
		morse.publications.status === "ready" &&
		morse.publications.data.kind === "complete"
			? morse.publications.data.publications
			: null;
	const sharedFiles =
		morse.shared.status === "ready" && morse.shared.data.kind === "complete"
			? morse.shared.data.files
			: null;
	const marks = useMemo(
		(): MorseMarks => ({
			published:
				listed && publications
					? publishedObjectIds(
							listed.rows,
							publications.flatMap((publication) => publication.refs),
						)
					: null,
			shared:
				listed && sharedFiles
					? sharedObjectIds(listed.rows, sharedFiles)
					: null,
		}),
		[listed, publications, sharedFiles],
	);
	const countNotes = {
		published: markNote(morse.publications, "your Morse publications"),
		shared: markNote(morse.shared, "your access policies"),
	};

	function go(target: GoTarget) {
		switch (target) {
			case "overview":
				navigate({ view: "overview" });
				return;
			case "timeline":
				navigate({ view: "overview" });
				setTimelineRequested(true);
				return;
			case "files":
				navigate({ view: "files", filter: "all" });
				return;
			case "expiring":
				navigate({ view: "files", filter: "expiring" });
				return;
			case "transfers":
				transfersPanel.open();
				return;
		}
	}

	function extendSelected() {
		if (selection.size > 0 && actions)
			setBulk({ kind: "extend", scope: "selected" });
	}

	// A jump shows the blob in Files: the filter and the search give way if they hide it.
	function jumpTo({ row, reason }: BlobMatch) {
		if (route.view !== "files" || !matchesFilter(row, filter, marks))
			navigate({ view: "files", filter: "all" });
		if (!matchesSearch(row, query)) setQuery("");
		setJump((current) => ({
			objectId: row.blob.objectId,
			ask:
				reason === "expiring" ? { section: "storage", action: "extend" } : null,
			request: (current?.request ?? 0) + 1,
		}));
	}

	useShortcuts({
		onPalette: () => setPaletteOpen((open) => !open),
		onGo: go,
		onExtendSelected: extendSelected,
	});

	useEffect(() => {
		if (!timelineRequested || route.view !== "overview") return;
		document
			.getElementById("expiry-timeline")
			?.scrollIntoView({ block: "start" });
		setTimelineRequested(false);
	}, [timelineRequested, route.view]);

	return (
		<>
			<div className="glow violet" aria-hidden="true" />
			<div className="glow teal" aria-hidden="true" />
			<div className="app">
				<Rail
					route={route}
					transfersActive={transfersSummary.active}
					transfersPanel={transfersPanel}
					profileMenu={profileMenu}
				/>
				<div className="main">
					<Topbar
						title={route.view === "overview" ? "Overview" : "Files"}
						context={contextLine(address, listed)}
						network={network}
						address={address}
						funds={funds}
						balanceMenu={balanceMenu}
						onPalette={() => setPaletteOpen(true)}
						paletteOpen={paletteOpen}
						transfers={transfersSummary}
						transfersPanel={transfersPanel}
						onUpload={pickers.openFiles}
					/>
					{route.view === "overview" ? (
						<Overview
							network={network}
							address={address}
							listing={listing}
							listed={listed}
							prices={funds.prices}
							activity={activity.read}
							morse={morse}
							onExtendExpiring={
								actions
									? () => setBulk({ kind: "extend", scope: "expiring" })
									: null
							}
							onTopUp={address === null ? null : balanceMenu.open}
							onConnect={profileMenu.open}
							onRetryBlobs={blobs.refresh}
							onRetryActivity={activity.refresh}
							onShowPublished={() =>
								navigate({ view: "files", filter: "published" })
							}
							pickers={pickers}
						/>
					) : (
						<FilesView
							key={`${network.id}:${address ?? ""}`}
							network={network}
							address={address}
							filter={filter}
							query={query}
							onQueryChange={setQuery}
							sort={sort}
							onSort={setSort}
							onSortBy={(key) => setSort((current) => nextSort(current, key))}
							layout={layout}
							onLayout={setLayout}
							listing={listing}
							listed={listed}
							marks={marks}
							countNotes={countNotes}
							onRefresh={refreshChain}
							onConnect={profileMenu.open}
							inspector={inspector}
							onExtendExpiring={() =>
								setBulk({ kind: "extend", scope: "expiring" })
							}
							selection={selection}
							onSelectionChange={changeSelection}
							onBulk={(kind) =>
								setBulk(
									kind === "extend" ? { kind, scope: "selected" } : { kind },
								)
							}
							jump={jump}
						/>
					)}
				</div>
			</div>
			<TransfersPanel panel={transfersPanel} transfers={transfers} />
			{sheet.open && address !== null ? (
				<UploadSheet
					network={network}
					owner={normalizeSuiAddress(address)}
					library={picked.library}
					selected={picked.selected}
					balances={funds.balances}
					session={sheet.session}
					onClose={closeSheet}
					onConfirm={confirmUpload}
				/>
			) : null}
			{bulk !== null && listed !== null ? (
				<BulkSheetFor
					bulk={bulk}
					network={network}
					listed={listed}
					rows={
						bulk.kind === "extend" && bulk.scope === "expiring"
							? listed.rows.filter((row) => matchesFilter(row, "expiring"))
							: selectedRows(selection, listed.rows)
					}
					actions={actions}
					balances={funds.balances}
					onClose={() => setBulk(null)}
					onChanged={refreshChain}
				/>
			) : null}
			{paletteOpen ? (
				<CommandPalette
					commands={paletteCommands(
						{
							network,
							listed,
							storagePricePerUnit:
								funds.prices.status === "ready"
									? funds.prices.data.storagePerUnit
									: null,
							selected: listed ? selectedRows(selection, listed.rows) : [],
							canSign: actions !== null,
							autoExtend,
						},
						{
							extendExpiring: () =>
								setBulk({ kind: "extend", scope: "expiring" }),
							extendSelected,
							setAutoExtend: (enabled) => {
								autoExtend?.update({ enabled });
								// Turning it on opens the setting: nothing renews until a cap is set.
								if (enabled) setAutoExtendOpen(true);
							},
							autoExtendSettings: () => setAutoExtendOpen(true),
							go,
							filter: (next) => navigate({ view: "files", filter: next }),
						},
					)}
					rows={listed?.rows ?? []}
					onJump={jumpTo}
					onFilter={(text) => {
						setQuery(text);
						if (route.view !== "files")
							navigate({ view: "files", filter: "all" });
					}}
					onClose={() => setPaletteOpen(false)}
				/>
			) : null}
			{autoExtendOpen && autoExtend ? (
				<AutoExtendSheet
					network={network}
					autoExtend={autoExtend}
					onClose={() => setAutoExtendOpen(false)}
				/>
			) : null}
			{dragging ? <DropOverlay connected={address !== null} /> : null}
			{dropProblem !== null ? (
				<DropProblem
					message={dropProblem}
					onDismiss={() => setDropProblem(null)}
				/>
			) : null}
			{pickers.inputs}
		</>
	);
}

/** The line under the view title: who, how many blobs, how much. */
function contextLine(address: string | null, listed: ListedBlobs | null) {
	if (address === null) return "Not connected";
	const who = shortenAddress(address);
	if (listed === null) return `${who} · reading blobs`;
	const count = listed.rows.length;
	return `${who} · ${count === 1 ? "1 blob" : `${count} blobs`} · ${formatBytes(listed.totalSize)}`;
}

/** Why a Morse count is missing, or `undefined` once it is real. */
function markNote(
	read: ChainRead<Publications | SharedFiles>,
	what: string,
): string | undefined {
	switch (read.status) {
		case "idle":
		case "loading":
			return `Reading ${what} from chain…`;
		case "error":
			return `Could not read ${what}: ${errorMessage(read.error)}`;
		case "ready":
			return read.data.kind === "unavailable" ? read.data.reason : undefined;
	}
}

/** The open bulk sheet; the ones that sign need a connected wallet. */
function BulkSheetFor({
	bulk,
	network,
	listed,
	rows,
	actions,
	balances,
	onClose,
	onChanged,
}: {
	bulk:
		| { kind: Exclude<BulkSheetKind, "extend"> }
		| { kind: "extend"; scope: ExtendScope };
	network: NetworkConfig;
	listed: ListedBlobs;
	rows: readonly BlobRow[];
	actions: WalletActions | null;
	balances: ChainRead<Balances>;
	onClose: () => void;
	onChanged: () => void;
}) {
	const { clock } = listed;
	switch (bulk.kind) {
		case "share":
			return (
				<BulkShareSheet
					network={network}
					rows={rows}
					clock={clock}
					onClose={onClose}
				/>
			);
		case "verify":
			return (
				<BulkVerifySheet
					network={network}
					rows={rows}
					clock={clock}
					onClose={onClose}
				/>
			);
		case "extend":
			return actions ? (
				<BulkExtendSheet
					network={network}
					scope={bulk.scope}
					rows={rows}
					clock={clock}
					actions={actions}
					balances={balances}
					onClose={onClose}
					onExtended={onChanged}
				/>
			) : null;
		case "publish":
			return actions ? (
				<BulkPublishSheet
					network={network}
					rows={rows}
					clock={clock}
					actions={actions}
					onClose={onClose}
					onPublished={onChanged}
				/>
			) : null;
		case "delete":
			return actions ? (
				<BulkDeleteSheet
					network={network}
					rows={rows}
					clock={clock}
					actions={actions}
					onClose={onClose}
					onDeleted={onChanged}
				/>
			) : null;
	}
}
