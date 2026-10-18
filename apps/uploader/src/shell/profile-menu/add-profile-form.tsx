import { type FormEvent, useId, useState } from "react";
import { shortenAddress } from "@/lib/shorten-address";
import type { NetworkId } from "@/network/networks";
import type { AddProfileResult } from "@/profiles/add-profile";
import { PROFILE_NAME_MAX_LENGTH, type ProfileDraft } from "@/profiles/profile";
import type { Session } from "@/wallet/use-session";
import { NetworkSwitch } from "./network-switch";

interface AddProfileFormProps {
	session: Session;
	network: NetworkId;
	busy: boolean;
	onSave: (draft: ProfileDraft) => AddProfileResult;
	onDone: () => void;
}

/** Saves one of the connected wallet's accounts on a network as a named profile. */
export function AddProfileForm({
	session,
	network,
	busy,
	onSave,
	onDone,
}: AddProfileFormProps) {
	const ids = useId();
	const [name, setName] = useState(
		session.account.label ?? session.wallet.name,
	);
	const [address, setAddress] = useState(session.account.address);
	const [networkId, setNetworkId] = useState<NetworkId>(network);
	const [problem, setProblem] = useState<string | null>(null);

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const result = onSave({
			name,
			walletId: session.walletId,
			walletName: session.wallet.name,
			address,
			network: networkId,
		});
		if (result.ok) {
			onDone();
		} else if (result.reason === "empty-name") {
			setProblem("Give the profile a name.");
		} else {
			setProblem(
				`This wallet and network pair is already saved as ${result.existing.name}.`,
			);
		}
	}

	return (
		<form className="addp" onSubmit={submit} aria-label="Add profile">
			<label className="field" htmlFor={`${ids}-name`}>
				<span className="label">Name</span>
				<input
					id={`${ids}-name`}
					type="text"
					value={name}
					maxLength={PROFILE_NAME_MAX_LENGTH}
					autoComplete="off"
					onChange={(event) => setName(event.target.value)}
				/>
			</label>
			<label className="field" htmlFor={`${ids}-account`}>
				<span className="label">Account in {session.wallet.name}</span>
				<select
					id={`${ids}-account`}
					value={address}
					onChange={(event) => setAddress(event.target.value)}
				>
					{session.wallet.accounts.map((account) => (
						<option key={account.address} value={account.address}>
							{account.label
								? `${account.label} · ${shortenAddress(account.address)}`
								: shortenAddress(account.address)}
						</option>
					))}
				</select>
			</label>
			<NetworkSwitch
				legend="Profile network"
				value={networkId}
				onChange={setNetworkId}
			/>
			{problem ? (
				<p className="problem" role="alert">
					{problem}
				</p>
			) : null}
			<div className="row-acts">
				<button className="btn solid sm" type="submit" disabled={busy}>
					Save profile
				</button>
				<button className="btn text sm" type="button" onClick={onDone}>
					Cancel
				</button>
			</div>
		</form>
	);
}
