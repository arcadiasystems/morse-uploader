import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { HelpCircle, KeyRound, ShieldCheck, Wallet } from "lucide-react";
import { useState } from "react";
import { Toaster } from "sonner";
import { ConnectedApp } from "./components/ConnectedApp";
import { HowItWorks } from "./components/HowItWorks";
import { NetworkSwitcher } from "./components/NetworkSwitcher";
import { ThemeToggle } from "./components/ThemeToggle";
import {
	DEFAULT_NETWORK,
	MAINNET_ENABLED,
	type MorseNetwork,
} from "./morse-config";
import { useHashRoute } from "./use-hash-route";
import { useTheme } from "./use-theme";
import "./app.css";
import "@arcadiasystems/morse-uploader/styles.css";

export function App() {
	const [network, setNetwork] = useState<MorseNetwork>(DEFAULT_NETWORK);
	const [showHelp, setShowHelp] = useState(false);
	const account = useCurrentAccount();
	const { theme, toggle } = useTheme();
	const route = useHashRoute();

	return (
		<div className="page">
			<header className="topbar">
				<a className="brand" href="#/">
					<span className="logo">M</span>
					<strong>Morse Uploader</strong>
				</a>
				<div className="actions">
					<button
						type="button"
						className="icon-btn"
						aria-label="How it works"
						onClick={() => setShowHelp(true)}
					>
						<HelpCircle size={18} />
					</button>
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
				{route === null ? (
					<section className="hero-wrap">
						<h1 className="hero">
							Encrypted file sharing on{" "}
							<span className="hero-accent">Sui and Walrus</span>.
						</h1>
						<p className="lede">
							A drop-in, headless React file uploader for Morse. Connect a
							testnet wallet, optionally gate a file behind an allowlist, and
							your wallet pays for and signs the upload. Share the link; only
							allowlist members can decrypt.
						</p>
						<ul className="pills">
							<li className="pill">
								<ShieldCheck size={15} /> Allowlist-gated encryption
							</li>
							<li className="pill">
								<KeyRound size={15} /> Seal key management
							</li>
							<li className="pill">
								<Wallet size={15} /> Your wallet pays
							</li>
						</ul>
					</section>
				) : null}

				{account === null ? (
					<div className="card connect-card">
						<span className="connect-icon" aria-hidden="true">
							<Wallet size={22} />
						</span>
						<div>
							<strong>Connect a wallet to begin</strong>
							<p className="muted">
								A Sui testnet wallet with a little SUI (gas) and WAL (storage).
							</p>
						</div>
					</div>
				) : (
					<ConnectedApp
						account={account}
						network={network}
						route={route}
						onShowHelp={() => setShowHelp(true)}
					/>
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
				. This UI is composed from the package's headless hooks and components.
			</footer>

			{showHelp ? <HowItWorks onClose={() => setShowHelp(false)} /> : null}

			<Toaster theme={theme} position="bottom-right" richColors closeButton />
		</div>
	);
}
