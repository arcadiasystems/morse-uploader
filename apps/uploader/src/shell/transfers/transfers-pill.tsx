import type { TransfersSummary } from "@/transfers/summarize-transfers";
import { formatDuration } from "@/transfers/transfer-view";
import type { Popover } from "../use-popover";

/**
 * The top bar's transfers pill (handover item 3): how many transfers are
 * under way and the time left, or what the queue waits for, with a ring
 * for the latest batch's progress. It opens the transfers slide-over.
 */
export function TransfersPill({
	summary,
	remainingSeconds,
	panel,
}: {
	summary: TransfersSummary;
	/** Seconds of uploading left at the measured speed; `null` before any speed is measured. */
	remainingSeconds: number | null;
	panel: Popover;
}) {
	const { active, failed, progress } = summary;
	const tone = active > 0 ? "busy" : failed > 0 ? "failed" : "idle";
	const share = Math.round(progress * 100);
	return (
		<button
			ref={panel.triggerRef}
			type="button"
			className={`tpill ${tone}`}
			aria-haspopup="dialog"
			aria-expanded={panel.isOpen}
			aria-controls={panel.isOpen ? panel.id : undefined}
			aria-label={`Transfers: ${spokenState(summary, remainingSeconds)}`}
			onClick={panel.toggle}
		>
			{active > 0 ? (
				<span
					className="ring"
					aria-hidden="true"
					style={{
						background: `conic-gradient(var(--violet) 0 ${share}%, rgba(255, 255, 255, 0.12) ${share}% 100%)`,
					}}
				/>
			) : null}
			<span aria-hidden="true">
				<CountText summary={summary} />
				{active > 0 ? (
					<span className="state">
						{" "}
						· {stateText(summary, remainingSeconds)}
					</span>
				) : null}
			</span>
		</button>
	);
}

/** The count, with its noun in a span that phones drop to save room. */
function CountText({ summary }: { summary: TransfersSummary }) {
	const { active, failed } = summary;
	if (active > 0)
		return (
			<>
				{active}
				<span className="word">
					{active === 1 ? " transfer" : " transfers"}
				</span>
			</>
		);
	if (failed > 0) return <>{failed} failed</>;
	return <>No transfers</>;
}

/**
 * What the pill says after the count: the wallet step first, since it
 * waits for the user; then the upload time left across the active items.
 */
function stateText(
	{ now }: TransfersSummary,
	remainingSeconds: number | null,
): string {
	switch (now.kind) {
		case "idle":
			return "idle";
		case "paused":
			return "paused";
		case "signing":
			return "signing";
		case "retrying":
			return "retrying";
		case "uploading":
			return remainingSeconds === null
				? "starting"
				: formatDuration(remainingSeconds);
		case "working":
			return remainingSeconds !== null && remainingSeconds > 0
				? formatDuration(remainingSeconds)
				: "working";
	}
}

function spokenState(
	summary: TransfersSummary,
	remainingSeconds: number | null,
): string {
	const { active, failed, now } = summary;
	if (active === 0)
		return failed > 0
			? `${failed} stopped, open to retry or finish`
			: "none in progress";
	const count = active === 1 ? "1 in progress" : `${active} in progress`;
	if (now.kind === "uploading" && remainingSeconds !== null)
		return `${count}, about ${formatDuration(remainingSeconds)} of uploading left`;
	return `${count}, ${stateText(summary, remainingSeconds)}`;
}
