import type { NetworkConfig } from "@/network/networks";

/** The current network before a wallet connects. Switching lives in the profile menu. */
export function NetworkChip({ network }: { network: NetworkConfig }) {
	return (
		<span className="net">
			<i aria-hidden="true" />
			<b>{network.label}</b>
		</span>
	);
}
