import { useCurrentNetwork } from "@mysten/dapp-kit-react";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { useCallback, useMemo, useState } from "react";
import { filterRows } from "@/blobs/filter-rows";
import { type ListedBlobs, listBlobs } from "@/blobs/list-blobs";
import { DEFAULT_SORT, nextSort, type RowSort } from "@/blobs/sort-rows";
import { useBlobListing } from "@/blobs/use-blob-listing";
import { useFunds } from "@/funds/use-funds";
import { formatBytes } from "@/lib/format-bytes";
import { shortenAddress } from "@/lib/shorten-address";
import type { PickedFile } from "@/local/local-library";
import { usePickedFiles } from "@/local/use-picked-files";
import { useAutoExtend } from "@/manage/use-auto-extend";
import { NETWORKS } from "@/network/networks";
import { summarizeTransfers } from "@/transfers/summarize-transfers";
import type { TransferBatch } from "@/transfers/transfer-job";
import { useTransferQueue } from "@/transfers/use-transfer-queue";
import { useSession } from "@/wallet/use-session";
import { useWalletActions } from "@/wallet/use-wallet-actions";
import { type FileFilter, useAppRoute } from "./app-route";
import { BLOB_VIEWS, type BlobView } from "./blob-views";
import type { DrawerContext } from "./drawer/blob-drawer";
import { type ExtendAllScope, ExtendAllSheet } from "./drawer/extend-all-sheet";
import { useFilePickers } from "./file-pickers";
import { WalrusPane } from "./panes/walrus-pane";
import { Rail } from "./rail/rail";
import { Topbar } from "./topbar";
import { TransfersPanel } from "./transfers/transfers-panel";
import { UploadSheet } from "./upload-sheet/upload-sheet";
import { usePopover } from "./use-popover";

/** The Walrus pane's view for each Files filter. */
const PANE_VIEWS: Readonly<Record<FileFilter, BlobView>> = {
	all: "all",
	quilts: "quilts",
	encrypted: "encrypted",
	expiring: "expiring",
	published: "publications",
	shared: "shared",
};

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
	const [route] = useAppRoute();
	const profileMenu = usePopover();
	const balanceMenu = usePopover();
	const transfersPanel = usePopover();
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<RowSort>(DEFAULT_SORT);
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
	const refreshChain = useCallback(() => {
		refreshBlobs();
		refreshFunds();
	}, [refreshBlobs, refreshFunds]);
	const transfers = useTransferQueue(network.id, address, refreshChain);
	const transfersSummary = summarizeTransfers(transfers.state);
	const actions = useWalletActions(network.id);
	const [extendAll, setExtendAll] = useState<ExtendAllScope | null>(null);

	function upload(files: PickedFile[]) {
		picked.replace(files);
		setSheet((current) => ({ session: current.session + 1, open: true }));
	}
	const pickers = useFilePickers(upload);

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
	const autoExtend = useAutoExtend({
		network,
		actions,
		listed,
		storagePricePerUnit:
			funds.prices.status === "ready" ? funds.prices.data.storagePerUnit : null,
		refreshBlobs,
		onRenewed: refreshChain,
	});
	const drawer: DrawerContext = {
		actions,
		balances: funds.balances,
		autoExtend,
		onChanged: refreshChain,
	};
	const view = PANE_VIEWS[route.filter];
	const viewFilter = BLOB_VIEWS[view].filter;

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
						title="Files"
						context={contextLine(address, listed)}
						network={network}
						address={address}
						funds={funds}
						balanceMenu={balanceMenu}
						query={query}
						onQueryChange={setQuery}
						searchDisabled={address === null}
						transfers={transfersSummary}
						transfersPanel={transfersPanel}
						onUpload={pickers.openFiles}
					/>
					<div className="content">
						<WalrusPane
							key={`${network.id}:${address ?? ""}`}
							network={network}
							address={address}
							view={view}
							query={query}
							onClearQuery={() => setQuery("")}
							sort={sort}
							onSort={(key) => setSort((current) => nextSort(current, key))}
							listing={listing}
							listed={listed}
							onRefresh={blobs.refresh}
							prices={funds.prices}
							onConnect={profileMenu.open}
							drawer={drawer}
							onExtendExpiring={() => setExtendAll("expiring")}
						/>
					</div>
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
			{extendAll !== null && actions !== null && listed !== null ? (
				<ExtendAllSheet
					network={network}
					listed={listed}
					viewRows={
						viewFilter === null
							? []
							: filterRows(listed.rows, viewFilter, query)
					}
					viewLabel={BLOB_VIEWS[view].label}
					initialScope={extendAll}
					actions={actions}
					balances={funds.balances}
					onClose={() => setExtendAll(null)}
					onExtended={refreshChain}
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
	return `${who} · ${count === 1 ? "1 blob" : `${count} blobs`} · ${formatBytes(listed.summary.totalSize)}`;
}
