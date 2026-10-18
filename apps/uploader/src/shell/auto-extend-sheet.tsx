import { useId, useRef } from "react";
import type { AutoExtend } from "@/manage/use-auto-extend";
import type { NetworkConfig } from "@/network/networks";
import { AutoExtendPanel } from "./inspector/auto-extend-panel";
import { useModalFocus } from "./use-modal-focus";

/**
 * The profile's auto-extend setting outside the inspector, opened from the
 * command palette: the same switch, cap and renewal window, for every
 * certified blob of the profile (PROTOCOL-NOTES section 9).
 */
export function AutoExtendSheet({
	network,
	autoExtend,
	onClose,
}: {
	network: NetworkConfig;
	autoExtend: AutoExtend;
	onClose: () => void;
}) {
	const ids = useId();
	const dialog = useRef<HTMLDivElement>(null);
	useModalFocus(dialog, onClose);
	return (
		<div className="scrim">
			<div
				className="modal bulk-sheet narrow"
				role="dialog"
				aria-modal="true"
				aria-labelledby={`${ids}-title`}
				ref={dialog}
			>
				<div className="l">
					<h2 id={`${ids}-title`}>Auto-extend</h2>
					<AutoExtendPanel
						network={network}
						autoExtend={autoExtend}
						covers="profile"
					/>
					<div className="acts">
						<button className="btn" type="button" onClick={onClose}>
							Done
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
