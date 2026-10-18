import type { NetworkConfig } from "@/network/networks";

/** The current network, as in the design's top bar. Switching lives in the profile menu. */
export function NetworkChip({ network }: { network: NetworkConfig }) {
	return (
		<span
			className={
				network.id === "mainnet" ? "chip net mainnet hidem" : "chip net hidem"
			}
		>
			<i aria-hidden="true" />
			<b>{network.label}</b>
		</span>
	);
}
