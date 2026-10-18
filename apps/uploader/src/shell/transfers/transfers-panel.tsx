import type { TransferQueueHandle } from "@/transfers/use-transfer-queue";
import type { Popover } from "../use-popover";
import { TransfersPane } from "./transfer-queue";

/**
 * The slide-over from the right edge that holds the transfer queue, opened
 * by the transfers pill or the rail. Until R3 it shows the existing queue.
 */
export function TransfersPanel({
	panel,
	transfers,
}: {
	panel: Popover;
	transfers: TransferQueueHandle;
}) {
	if (!panel.isOpen) return null;
	const { queue, state, restoreError } = transfers;
	return (
		<div
			ref={panel.panelRef}
			id={panel.id}
			className="tpanel"
			role="dialog"
			aria-label="Transfers"
		>
			<TransfersPane
				state={state}
				onRetry={(id) => queue.retry(id)}
				onDismiss={(id) => queue.dismiss(id)}
				onPause={() => queue.pause()}
				onResume={() => queue.resume()}
				restoreError={restoreError}
				onClose={() => panel.close()}
			/>
		</div>
	);
}
