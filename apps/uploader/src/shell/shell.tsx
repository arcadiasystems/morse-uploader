import { useCurrentNetwork } from "@mysten/dapp-kit-react";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { useCallback, useMemo, useState } from "react";
import { filterRows } from "@/blobs/filter-rows";
import { listBlobs } from "@/blobs/list-blobs";
import { DEFAULT_SORT, nextSort, type RowSort } from "@/blobs/sort-rows";
import { useBlobListing } from "@/blobs/use-blob-listing";
import { useFunds } from "@/funds/use-funds";
import type { PickedFile } from "@/local/local-library";
import { useLocalLibrary } from "@/local/use-local-library";
import { useAutoExtend } from "@/manage/use-auto-extend";
import { NETWORKS } from "@/network/networks";
import type { TransferBatch } from "@/transfers/transfer-job";
import { useTransferQueue } from "@/transfers/use-transfer-queue";
import { useSession } from "@/wallet/use-session";
import { useWalletActions } from "@/wallet/use-wallet-actions";
import { BLOB_VIEWS, type BlobView } from "./blob-views";
import type { DrawerContext } from "./drawer/blob-drawer";
import { type ExtendAllScope, ExtendAllSheet } from "./drawer/extend-all-sheet";
import { useFilePickers } from "./file-pickers";
import { LocalPane } from "./panes/local-pane";
import { WalrusPane } from "./panes/walrus-pane";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { TransfersPane } from "./transfer-queue";
import { UploadSheet } from "./upload-sheet/upload-sheet";
import { usePopover } from "./use-popover";

/** The app shell: top bar, sidebar, the two panes and the transfer queue. */
export function Shell() {
	const network = NETWORKS[useCurrentNetwork()];
	const session = useSession();
	const address = session?.account.address ?? null;
	const funds = useFunds(network, address);
	const blobs = useBlobListing(network, address);
	const profileMenu = usePopover();
	const [view, setView] = useState<BlobView>("all");
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<RowSort>(DEFAULT_SORT);
	const local = useLocalLibrary();
	// Each opening is a new session, so the sheet reads prices again.
	const [sheet, setSheet] = useState<{ session: number; open: boolean }>({
		session: 0,
		open: false,
	});
	const openSheet = useCallback(
		() => setSheet((current) => ({ session: current.session + 1, open: true })),
		[],
	);
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
	const actions = useWalletActions(network.id);
	const [extendAll, setExtendAll] = useState<ExtendAllScope | null>(null);

	function addPicked(picked: PickedFile[], thenUpload = false) {
		// Files picked to upload are the selection: nothing chosen earlier rides along.
		if (thenUpload) local.clearSelection();
		local.add(picked);
		if (thenUpload) openSheet();
	}
	const pickers = useFilePickers(addPicked);

	function onUpload() {
		if (local.selected.size > 0) openSheet();
		else pickers.openFilesToUpload();
	}

	function confirmUpload(batch: TransferBatch) {
		transfers.queue.enqueue(batch);
		closeSheet();
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
	const viewFilter = BLOB_VIEWS[view].filter;

	return (
		<div className="app">
			<Topbar
				network={network}
				address={address}
				funds={funds}
				profileMenu={profileMenu}
				query={query}
				onQueryChange={setQuery}
				searchDisabled={address === null}
				onUpload={onUpload}
			/>
			<div className="body">
				<Sidebar
					view={view}
					onSelect={setView}
					network={network}
					connected={address !== null}
					listed={listed}
					onExtendExpiring={actions ? () => setExtendAll("expiring") : null}
				/>
				<main className="main">
					<div className="panes">
						<LocalPane
							local={local}
							pickers={pickers}
							onAdd={addPicked}
							nowMs={Date.now()}
						/>
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
					<TransfersPane
						state={transfers.state}
						onRetry={(id) => transfers.queue.retry(id)}
						onDismiss={(id) => transfers.queue.dismiss(id)}
						onPause={() => transfers.queue.pause()}
						onResume={() => transfers.queue.resume()}
						restoreError={transfers.restoreError}
					/>
				</main>
			</div>
			{sheet.open && address !== null ? (
				<UploadSheet
					network={network}
					owner={normalizeSuiAddress(address)}
					library={local.library}
					selected={local.selected}
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
		</div>
	);
}
