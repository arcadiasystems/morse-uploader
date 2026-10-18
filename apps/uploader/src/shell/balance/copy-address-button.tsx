import { useState } from "react";
import { Icon } from "@/components/icon";

type CopyState = "idle" | "copied" | "failed";

/** Copies the full address, for pasting into a faucet. */
export function CopyAddressButton({ address }: { address: string }) {
	const [state, setState] = useState<CopyState>("idle");

	async function copy() {
		try {
			await navigator.clipboard.writeText(address);
			setState("copied");
		} catch {
			setState("failed");
		}
	}

	return (
		<>
			<button className="btn btn-soft xs" type="button" onClick={copy}>
				<Icon name="copy" size={13} />
				{state === "copied" ? "Address copied" : "Copy address"}
			</button>
			<span className="sr-only" role="status">
				{state === "copied" ? "Address copied" : ""}
			</span>
			{state === "failed" ? (
				<p className="problem" role="alert">
					The browser blocked the clipboard. Select the address above and copy
					it.
				</p>
			) : null}
		</>
	);
}
