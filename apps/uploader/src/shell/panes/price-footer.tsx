import { TokenAmount } from "@/components/token-amount";
import type { WalrusPrices } from "@/funds/types";
import { groupThousands } from "@/lib/group-thousands";
import type { ChainRead } from "@/lib/use-chain-read";

/** Live Walrus prices for the network, read from the system object. */
export function PriceFooter({ prices }: { prices: ChainRead<WalrusPrices> }) {
	if (prices.status === "error") {
		return (
			<div className="ft">
				<span>Walrus prices are unavailable right now.</span>
			</div>
		);
	}
	if (prices.status !== "ready") {
		return (
			<div className="ft">
				<span>Reading Walrus prices…</span>
			</div>
		);
	}
	const { storagePerUnit, smallestUpload } = prices.data;
	return (
		<div className="ft">
			<span title="Storage price per MiB of encoded size per epoch">
				Storage <b>{groupThousands(storagePerUnit.toString())}</b>{" "}
				FROST/MiB/epoch
			</span>
			<span className="sp" />
			<span title="Storage and write fee for the smallest blob for one epoch, from the Walrus system object">
				Smallest upload{" "}
				<b>
					<TokenAmount raw={smallestUpload} context="compact" />
				</b>{" "}
				WAL
			</span>
		</div>
	);
}
