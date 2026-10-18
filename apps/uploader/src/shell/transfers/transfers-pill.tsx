import type { TransfersSummary } from "@/transfers/summarize-transfers";
import type { Popover } from "../use-popover";

/**
 * The top bar's transfers pill: how many transfers are under way and what
 * the queue is doing, with a ring for the latest batch's progress. It opens
 * the transfer queue.
 */
export function TransfersPill({
	summary,
	panel,
}: {
	summary: TransfersSummary;
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
			aria-label={`Transfers: ${spokenState(summary)}`}
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
					<span className="state"> · {stateText(summary)}</span>
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

function stateText({ now }: TransfersSummary): string {
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
			return now.secondsLeft === null ? "starting" : `${now.secondsLeft} s`;
		case "working":
			return "working";
	}
}

function spokenState(summary: TransfersSummary): string {
	const { active, failed, now } = summary;
	if (active === 0)
		return failed > 0
			? `${failed} stopped, open to retry or finish`
			: "none in progress";
	const count = active === 1 ? "1 in progress" : `${active} in progress`;
	if (now.kind === "uploading" && now.secondsLeft !== null)
		return `${count}, about ${now.secondsLeft} seconds left on the current upload`;
	return `${count}, ${stateText(summary)}`;
}
