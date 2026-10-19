import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useCallback, useState } from "react";
import type { ChainRead } from "@/lib/use-chain-read";
import type { NetworkConfig } from "@/network/networks";
import {
	type QuoteInputs,
	readQuoteInputs,
	useQuoteInputs,
} from "@/upload/use-upload-quote";

export interface PricedInputs {
	inputs: QuoteInputs;
	readAt: Date;
}

export interface TrayPricing {
	/** The prices the tray shows: from when it opened, or the re-read before signing. */
	read: ChainRead<QuoteInputs>;
	/** Reads the prices again from chain; the tray shows them from then on. */
	reread: (signal: AbortSignal) => Promise<PricedInputs>;
}

/**
 * The tray's prices (the handover's build notes): read from the Walrus
 * system object when the tray opens (each new `session`) and again right
 * before signing. A re-read replaces what the tray shows, so a changed
 * price is the price on screen when the user is asked again.
 */
export function useTrayPricing(
	network: NetworkConfig,
	session: number,
): TrayPricing {
	const client = useCurrentClient();
	const opened = useQuoteInputs(network, session);
	const key = `${network.id}:${session}`;
	const [fresh, setFresh] = useState<(PricedInputs & { key: string }) | null>(
		null,
	);
	const reread = useCallback(
		async (signal: AbortSignal): Promise<PricedInputs> => {
			const inputs = await readQuoteInputs(client, network, signal);
			signal.throwIfAborted();
			const priced = { inputs, readAt: new Date() };
			setFresh({ ...priced, key });
			return priced;
		},
		[client, network, key],
	);
	const newer =
		fresh !== null &&
		fresh.key === key &&
		(opened.status !== "ready" || fresh.readAt > opened.readAt);
	return {
		read: newer
			? {
					status: "ready",
					data: fresh.inputs,
					readAt: fresh.readAt,
					refreshing: false,
				}
			: opened,
		reread,
	};
}
