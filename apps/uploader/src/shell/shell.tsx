import { useCurrentNetwork } from "@mysten/dapp-kit-react";
import { useMemo, useState } from "react";
import { listBlobs } from "@/blobs/list-blobs";
import { DEFAULT_SORT, nextSort, type RowSort } from "@/blobs/sort-rows";
import { useBlobListing } from "@/blobs/use-blob-listing";
import { useFunds } from "@/funds/use-funds";
import { useLocalLibrary } from "@/local/use-local-library";
import { NETWORKS } from "@/network/networks";
import { useSession } from "@/wallet/use-session";
import type { BlobView } from "./blob-views";
import { useFilePickers } from "./file-pickers";
import { LocalPane } from "./panes/local-pane";
import { WalrusPane } from "./panes/walrus-pane";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { TransferQueue } from "./transfer-queue";
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
	const pickers = useFilePickers((picked) => local.add(picked));

	const listing = blobs.read;
	const listed = useMemo(
		() =>
			listing.status === "ready"
				? listBlobs(listing.data, listing.readAt.getTime())
				: null,
		[listing],
	);

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
			/>
			<div className="body">
				<Sidebar
					view={view}
					onSelect={setView}
					network={network}
					connected={address !== null}
					listed={listed}
				/>
				<main className="main">
					<div className="panes">
						<LocalPane
							local={local}
							pickers={pickers}
							onAdd={local.add}
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
						/>
					</div>
					<TransferQueue />
				</main>
			</div>
			{pickers.inputs}
		</div>
	);
}
