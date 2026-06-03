import { MorseUploaderProvider } from "@arcadiasystems/morse-uploader";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useState } from "react";
import { Toaster } from "sonner";
import { FileView } from "./components/FileView";
import { NetworkSwitcher } from "./components/NetworkSwitcher";
import { ThemeToggle } from "./components/ThemeToggle";
import { Uploader } from "./components/Uploader";
import {
	DEFAULT_NETWORK,
	MAINNET_ENABLED,
	type MorseNetwork,
} from "./morse-config";
import { useMorseClient } from "./use-morse-client";
import { useTheme } from "./use-theme";
import "./app.css";

export function App() {
	const [network, setNetwork] = useState<MorseNetwork>(DEFAULT_NETWORK);
	const account = useCurrentAccount();
	const morse = useMorseClient(network);
	const { theme, toggle } = useTheme();
	// Minimal routing: /<blobId> shows the single-file viewer, / shows the uploader.
	const blobId = window.location.pathname.replace(/^\/+/, "");

	return (
		<div className="page">
			<header className="topbar">
				<a className="brand" href="/">
					<span className="logo">M</span>
					<strong>Morse Uploader</strong>
				</a>
				<div className="actions">
					<NetworkSwitcher
						network={network}
						onChange={setNetwork}
						mainnetEnabled={MAINNET_ENABLED}
					/>
					<ThemeToggle theme={theme} onToggle={toggle} />
					<ConnectButton />
				</div>
			</header>

			<main className="content">
				{blobId ? (
					<FileView blobId={blobId} />
				) : (
					<>
						<h1 className="hero">Upload to Walrus in one drop.</h1>
						<p className="lede">
							A drop-in, headless React uploader for Morse on Sui and Walrus.
							Connect a testnet wallet, drop a file, and your wallet pays for
							and signs the upload.
						</p>

						{account === null ? (
							<div className="card empty">
								Connect a Sui testnet wallet (with some SUI and WAL) to begin.
							</div>
						) : morse === null ? (
							<div className="card empty">Preparing your wallet...</div>
						) : (
							<MorseUploaderProvider value={morse}>
								<Uploader />
							</MorseUploaderProvider>
						)}
					</>
				)}
			</main>

			<footer className="foot muted">
				Built with{" "}
				<a
					className="foot-link"
					href="https://github.com/arcadiasystems/morse-uploader"
					target="_blank"
					rel="noreferrer"
				>
					@arcadiasystems/morse-uploader
				</a>
				. This UI is fully custom, composed from the package's headless hooks
				and primitives.
			</footer>

			<Toaster theme={theme} position="bottom-right" richColors closeButton />
		</div>
	);
}
