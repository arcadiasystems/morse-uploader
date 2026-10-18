/** Shortens a Sui address for display: `0x4ea7…4c75`. */
export function shortenAddress(address: string): string {
	if (address.length <= 12) return address;
	return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
