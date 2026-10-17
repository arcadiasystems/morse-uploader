import { useId } from "react";
import { NETWORK_IDS, NETWORKS, type NetworkId } from "@/network/networks";

interface NetworkSwitchProps {
	legend: string;
	value: NetworkId;
	onChange: (network: NetworkId) => void;
	disabled?: boolean;
}

/** Testnet or Walrus Mainnet, as a native radio group (arrow keys move between them). */
export function NetworkSwitch({
	legend,
	value,
	onChange,
	disabled = false,
}: NetworkSwitchProps) {
	const name = useId();
	return (
		<fieldset className="seg" disabled={disabled}>
			<legend className="label">{legend}</legend>
			<div className="opts">
				{NETWORK_IDS.map((id) => (
					<label key={id} className={id === value ? "on" : undefined}>
						<input
							type="radio"
							name={name}
							value={id}
							checked={id === value}
							onChange={() => onChange(id)}
						/>
						{NETWORKS[id].label}
					</label>
				))}
			</div>
		</fieldset>
	);
}
