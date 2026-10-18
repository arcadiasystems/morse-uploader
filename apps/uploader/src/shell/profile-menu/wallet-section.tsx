import {
	getWalletUniqueIdentifier,
	type UiWallet,
} from "@mysten/dapp-kit-react";
import { shortenAddress } from "@/lib/shorten-address";
import type { Session } from "@/wallet/use-session";

interface WalletSectionProps {
	session: Session | null;
	wallets: readonly UiWallet[];
	connecting: boolean;
	busy: boolean;
	onConnect: (wallet: UiWallet) => void;
	onDisconnect: () => void;
}

/** The connected wallet with a disconnect action, or the wallets found to connect. */
export function WalletSection({
	session,
	wallets,
	connecting,
	busy,
	onConnect,
	onDisconnect,
}: WalletSectionProps) {
	if (session) {
		return (
			<div className="wal">
				<WalletIcon wallet={session.wallet} />
				<span className="who">
					<b>{session.wallet.name}</b>
					<code>{shortenAddress(session.account.address)}</code>
				</span>
				<button
					className="btn sm"
					type="button"
					disabled={busy}
					onClick={onDisconnect}
				>
					Disconnect
				</button>
			</div>
		);
	}
	if (wallets.length === 0) {
		return (
			<p className="note">
				No Sui wallet found in this browser. Install a Wallet Standard wallet,
				then reload.
			</p>
		);
	}
	return (
		<ul className="wlist">
			{wallets.map((wallet) => (
				<li key={getWalletUniqueIdentifier(wallet)}>
					<button
						type="button"
						className="wbtn"
						disabled={busy || connecting}
						onClick={() => onConnect(wallet)}
					>
						<WalletIcon wallet={wallet} />
						<b>{wallet.name}</b>
						<span>{connecting ? "Waiting…" : "Connect"}</span>
					</button>
				</li>
			))}
		</ul>
	);
}

function WalletIcon({ wallet }: { wallet: UiWallet }) {
	return (
		// biome-ignore lint/performance/noImgElement: wallet icons are data URIs the wallet supplies; next/image has nothing to optimize.
		<img className="wicon" src={wallet.icon} alt="" width={20} height={20} />
	);
}
