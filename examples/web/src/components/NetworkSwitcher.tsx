import type { MorseNetwork } from "../morse-config";

export function NetworkSwitcher({
	network,
	onChange,
	mainnetEnabled,
}: {
	network: MorseNetwork;
	onChange: (network: MorseNetwork) => void;
	mainnetEnabled: boolean;
}) {
	return (
		<div className="net" role="group" aria-label="Network">
			<button
				type="button"
				className={`net-opt ${network === "testnet" ? "net-on" : ""}`}
				aria-pressed={network === "testnet"}
				onClick={() => onChange("testnet")}
			>
				Testnet
			</button>
			<button
				type="button"
				className={`net-opt ${network === "mainnet" ? "net-on" : ""}`}
				aria-pressed={network === "mainnet"}
				disabled={!mainnetEnabled}
				title={
					mainnetEnabled ? undefined : "Mainnet is not yet supported by the SDK"
				}
				onClick={() => onChange("mainnet")}
			>
				Mainnet
			</button>
		</div>
	);
}
