"use client";

import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { useEffect, useState } from "react";
import { networkStore } from "@/network/network-store";
import { Shell } from "@/shell/shell";
import { createUploaderDAppKit } from "./create-uploader-dapp-kit";

/** The client-only root of /app: one dApp Kit instance, restored to the last network. */
export function AppRoot() {
	const [dAppKit] = useState(() => createUploaderDAppKit(networkStore.get()));

	useEffect(
		() => dAppKit.stores.$currentNetwork.listen(networkStore.set),
		[dAppKit],
	);

	return (
		<DAppKitProvider dAppKit={dAppKit}>
			<Shell />
		</DAppKitProvider>
	);
}
