import { Icon } from "@/components/icon";
import { useClipboardCopy } from "@/lib/use-clipboard-copy";

/** Copies the full address, for pasting into a faucet. */
export function CopyAddressButton({ address }: { address: string }) {
	const { state, copy } = useClipboardCopy();

	return (
		<>
			<button className="btn sm" type="button" onClick={() => copy(address)}>
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
