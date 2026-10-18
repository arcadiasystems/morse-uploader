import {
	useCurrentNetwork,
	useWalletConnection,
	useWallets,
} from "@mysten/dapp-kit-react";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { errorMessage } from "@/lib/error-message";
import { shortenAddress } from "@/lib/shorten-address";
import { useProfiles } from "@/profiles/use-profiles";
import { useProfileActions } from "@/wallet/use-profile-actions";
import { useSession } from "@/wallet/use-session";
import type { Popover } from "../use-popover";
import { AddProfileForm } from "./add-profile-form";
import { NetworkSwitch } from "./network-switch";
import { ProfileAvatar } from "./profile-avatar";
import { ProfileList } from "./profile-list";
import { WalletSection } from "./wallet-section";

/**
 * The rail's profile avatar and its menu, FileZilla's site manager for
 * wallets: saved wallet and network pairs to add, switch and remove, the
 * network switch, and the wallet connection.
 */
export function ProfileMenu({ popover }: { popover: Popover }) {
	const connection = useWalletConnection();
	const network = useCurrentNetwork();
	const wallets = useWallets();
	const profiles = useProfiles();
	const session = useSession();
	const actions = useProfileActions();
	const [busy, setBusy] = useState(false);
	const [adding, setAdding] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);

	async function run(action: () => Promise<void> | void) {
		setBusy(true);
		setProblem(null);
		try {
			await action();
		} catch (error) {
			setProblem(errorMessage(error));
		} finally {
			setBusy(false);
		}
	}

	const connecting = connection.isConnecting || connection.isReconnecting;
	const displayName = session
		? (session.profile?.name ?? session.account.label ?? session.wallet.name)
		: null;

	const short = session ? shortenAddress(session.account.address) : null;
	return (
		<div className="anchor">
			<button
				ref={popover.triggerRef}
				type="button"
				className="me"
				data-profile-trigger=""
				title={displayName && short ? `${displayName} · ${short}` : undefined}
				aria-haspopup="dialog"
				aria-expanded={popover.isOpen}
				aria-controls={popover.isOpen ? popover.id : undefined}
				onClick={popover.toggle}
			>
				{displayName && short ? (
					<>
						<ProfileAvatar name={displayName} />
						<span className="sr-only">
							Profile {displayName}, {short}
						</span>
					</>
				) : (
					<>
						<span className="av none" aria-hidden="true">
							<Icon name="wallet" size={16} />
						</span>
						<span className="sr-only">
							{connecting ? "Connecting…" : "Connect wallet"}
						</span>
					</>
				)}
			</button>
			{popover.isOpen ? (
				<div
					ref={popover.panelRef}
					id={popover.id}
					className="pop rail-pop"
					role="dialog"
					aria-label="Profiles, network and wallet"
				>
					<section className="sec" aria-labelledby={`${popover.id}-profiles`}>
						<h4 id={`${popover.id}-profiles`}>Profiles</h4>
						<ProfileList
							profiles={profiles}
							activeId={session?.profile?.id}
							busy={busy}
							onActivate={(profile) => run(() => actions.activate(profile))}
							onRemove={(profile) => actions.remove(profile.id)}
						/>
						{session && adding ? (
							<AddProfileForm
								session={session}
								network={network}
								busy={busy}
								onSave={(draft) => {
									const result = actions.save(draft);
									if (result.ok)
										void run(() => actions.activate(result.profile));
									return result;
								}}
								onDone={() => setAdding(false)}
							/>
						) : null}
						{session && !adding ? (
							<button
								className="btn text sm add"
								type="button"
								onClick={() => setAdding(true)}
							>
								{session.profile
									? "Add profile"
									: "Save this wallet and network as a profile"}
							</button>
						) : null}
					</section>
					<section className="sec">
						<NetworkSwitch
							legend="Network"
							value={network}
							disabled={busy}
							onChange={actions.switchNetwork}
						/>
					</section>
					<section className="sec" aria-labelledby={`${popover.id}-wallet`}>
						<h4 id={`${popover.id}-wallet`}>Wallet</h4>
						<WalletSection
							session={session}
							wallets={wallets}
							connecting={connecting}
							busy={busy}
							onConnect={(wallet) => run(() => actions.connect(wallet))}
							onDisconnect={() => run(actions.disconnect)}
						/>
					</section>
					{problem ? (
						<p className="problem" role="alert">
							{problem}
						</p>
					) : null}
				</div>
			) : null}
		</div>
	);
}
