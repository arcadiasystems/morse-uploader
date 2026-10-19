import { Icon } from "@/components/icon";
import { shortenAddress } from "@/lib/shorten-address";
import { NETWORKS } from "@/network/networks";
import type { Profile } from "@/profiles/profile";
import { ProfileAvatar } from "./profile-avatar";

interface ProfileListProps {
	profiles: readonly Profile[];
	activeId: string | undefined;
	busy: boolean;
	onActivate: (profile: Profile) => void;
	onRemove: (profile: Profile) => void;
}

/** Saved profiles; picking one switches to it, the cross removes it. */
export function ProfileList({
	profiles,
	activeId,
	busy,
	onActivate,
	onRemove,
}: ProfileListProps) {
	if (profiles.length === 0) {
		return (
			<p className="note">
				No saved profiles. Save a wallet and network pair to switch back to it
				in one step.
			</p>
		);
	}
	return (
		<ul className="plist">
			{profiles.map((profile) => {
				const active = profile.id === activeId;
				return (
					<li key={profile.id} className={active ? "prow on" : "prow"}>
						<button
							type="button"
							className="pick"
							aria-current={active ? "true" : undefined}
							disabled={busy}
							onClick={() => onActivate(profile)}
						>
							<ProfileAvatar name={profile.name} />
							<span className="who">
								<b>{profile.name}</b>
								<code>
									{profile.walletName} · {shortenAddress(profile.address)}
								</code>
							</span>
							<span
								className={
									profile.network === "mainnet" ? "tag green" : "tag lift"
								}
							>
								<i aria-hidden="true" />
								<b>{NETWORKS[profile.network].label}</b>
							</span>
							{active ? (
								<span className="tick">
									<Icon name="check" size={14} />
									<span className="sr-only">Active</span>
								</span>
							) : null}
						</button>
						<button
							type="button"
							className="rm"
							aria-label={`Remove profile ${profile.name}`}
							disabled={busy}
							onClick={() => onRemove(profile)}
						>
							<Icon name="close" size={14} />
						</button>
					</li>
				);
			})}
		</ul>
	);
}
