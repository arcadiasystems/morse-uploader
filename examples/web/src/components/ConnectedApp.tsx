import type { WalletStandardAccount } from "@arcadiasystems/morse-sdk";
import {
	MorseFilesProvider,
	type ParsedShareLink,
} from "@arcadiasystems/morse-uploader";
import { MorseFileDownloader } from "@arcadiasystems/morse-uploader/ui";
import type { MorseNetwork } from "../morse-config";
import { useFilesSetup } from "../use-files-setup";
import { Studio } from "./Studio";

/**
 * Mounted only when a wallet is connected. Builds the files handles, then routes
 * to the single-file downloader (share link) or the upload studio (home).
 */
export function ConnectedApp({
	account,
	network,
	route,
	onShowHelp,
}: {
	account: WalletStandardAccount;
	network: MorseNetwork;
	route: ParsedShareLink | null;
	onShowHelp: () => void;
}) {
	const setup = useFilesSetup(account, network);

	if (setup.status === "error") {
		return (
			<div className="card empty">
				Could not prepare your wallet for Morse. Check the console and try
				reconnecting.
			</div>
		);
	}

	if (setup.status !== "ready" || setup.handles === null) {
		return <div className="card empty">Preparing your wallet...</div>;
	}

	return (
		<MorseFilesProvider value={setup.handles}>
			{route === null ? (
				<Studio onShowHelp={onShowHelp} />
			) : (
				<MorseFileDownloader
					fileId={route.fileId as never}
					sealIdPrefix={route.sealIdPrefix}
					sealNonce={route.sealNonce}
				/>
			)}
		</MorseFilesProvider>
	);
}
