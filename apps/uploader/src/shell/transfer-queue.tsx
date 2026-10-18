import { type KeyboardEvent, useId, useRef, useState } from "react";
import { TokenAmount } from "@/components/token-amount";
import { errorMessage } from "@/lib/error-message";
import type {
	TransferItem,
	TransferState,
	TransferTab,
} from "@/transfers/transfer-state";
import { tabOf } from "@/transfers/transfer-state";
import { QueueRow } from "./queue/queue-row";

const TABS: Readonly<Record<TransferTab, { label: string; empty: string }>> = {
	queue: {
		label: "Queue",
		empty:
			"No transfers yet. Each upload shows its steps here: encode, register, upload, certify and record.",
	},
	done: {
		label: "Done",
		empty: "Finished uploads appear here with their blob ids.",
	},
	failed: {
		label: "Failed",
		empty:
			"Uploads that stop partway appear here, with a way to finish or retry.",
	},
};

const TAB_IDS = Object.keys(TABS) as TransferTab[];

interface TransfersPaneProps {
	state: TransferState;
	onRetry: (id: string) => void;
	onDismiss: (id: string) => void;
	onPause: () => void;
	onResume: () => void;
	restoreError: unknown;
}

/**
 * The transfer queue (design/app.html): Queue, Done and Failed tabs, each
 * item's steps with progress, speed and its blob id as soon as it exists,
 * the batch cost line, and Pause all, which pauses between items. Arrow
 * keys move between the tabs.
 */
export function TransfersPane({
	state,
	onRetry,
	onDismiss,
	onPause,
	onResume,
	restoreError,
}: TransfersPaneProps) {
	const ids = useId();
	const [tab, setTab] = useState<TransferTab>("queue");
	const tabRefs = useRef(new Map<TransferTab, HTMLButtonElement>());
	const byTab = (id: TransferTab) =>
		state.items.filter((item) => tabOf(item) === id);
	const shown = byTab(tab);

	function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		const step =
			event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
		if (step === 0) return;
		event.preventDefault();
		const next =
			TAB_IDS[(TAB_IDS.indexOf(tab) + step + TAB_IDS.length) % TAB_IDS.length];
		if (!next) return;
		setTab(next);
		tabRefs.current.get(next)?.focus();
	}

	const active = byTab("queue");
	// The most recent stopped item, announced to screen readers.
	const stopped = state.items
		.filter((item) => item.status.kind === "failed")
		.at(-1);
	const pending = active.length > 0;
	return (
		<section className="queue" aria-labelledby={`${ids}-title`}>
			<div className="hd">
				<h3 id={`${ids}-title`}>Transfers</h3>
				<div
					className="tabs"
					role="tablist"
					aria-label="Transfers"
					onKeyDown={onKeyDown}
				>
					{TAB_IDS.map((id) => {
						const count = byTab(id).length;
						return (
							<button
								key={id}
								ref={(node) => {
									if (node) tabRefs.current.set(id, node);
									else tabRefs.current.delete(id);
								}}
								id={`${ids}-${id}`}
								type="button"
								role="tab"
								className={id === tab ? "on" : undefined}
								aria-selected={id === tab}
								aria-controls={`${ids}-panel`}
								tabIndex={id === tab ? 0 : -1}
								onClick={() => setTab(id)}
							>
								{TABS[id].label}
								{count > 0 ? <span className="n">{count}</span> : null}
							</button>
						);
					})}
				</div>
				<Summary items={state.items} paused={state.paused} />
				<button
					className="btn sm pause"
					type="button"
					disabled={!pending && !state.paused}
					aria-pressed={state.paused}
					onClick={state.paused ? onResume : onPause}
				>
					{state.paused ? "Resume all" : "Pause all"}
				</button>
			</div>
			<div
				className="qlist"
				role="tabpanel"
				id={`${ids}-panel`}
				aria-labelledby={`${ids}-${tab}`}
			>
				{restoreError ? (
					<p className="qnote problem">
						Saved uploads could not be read back: {errorMessage(restoreError)}
					</p>
				) : null}
				{state.notice ? <p className="qnote problem">{state.notice}</p> : null}
				<p className="sr-only" role="status">
					{stopped ? `${stopped.name} stopped. ${stoppedReason(stopped)}` : ""}
				</p>
				{shown.length === 0 ? (
					<p className="qempty">{TABS[tab].empty}</p>
				) : (
					<table className="qtable">
						<thead>
							<tr className="q h">
								<th scope="col">
									<span className="sr-only">Type</span>
								</th>
								<th scope="col">File</th>
								<th scope="col" className="steps-h">
									Steps
								</th>
								<th scope="col">Progress</th>
								<th scope="col" className="id-h">
									Blob id
								</th>
								<th scope="col" className="sp-h">
									Speed
								</th>
							</tr>
						</thead>
						<tbody>
							{shown.map((item) => (
								<QueueRow
									key={item.id}
									item={item}
									onRetry={onRetry}
									onDismiss={onDismiss}
								/>
							))}
						</tbody>
					</table>
				)}
			</div>
		</section>
	);
}

/** "3 active · 1 done · 1 retrying · this batch ≈ 0.031 WAL + 0.009 SUI" */
function Summary({
	items,
	paused,
}: {
	items: readonly TransferItem[];
	paused: boolean;
}) {
	const latest = items.at(-1);
	if (!latest) return <span className="sum">Nothing in progress</span>;
	const batch = items.filter((item) => item.batchId === latest.batchId);
	const count = (test: (item: TransferItem) => boolean) =>
		batch.filter(test).length;
	const active = count(
		(item) => tabOf(item) === "queue" && item.status.kind !== "retrying",
	);
	const done = count((item) => item.status.kind === "done");
	const retrying = count((item) => item.status.kind === "retrying");
	const failed = count((item) => item.status.kind === "failed");
	const wal = batch.reduce((sum, item) => sum + item.estimate.walFrost, 0n);
	const sui = batch.every((item) => item.estimate.suiMist !== null)
		? batch.reduce((sum, item) => sum + (item.estimate.suiMist ?? 0n), 0n)
		: null;
	const parts: [number, string][] = [
		[active, "active"],
		[done, "done"],
		[retrying, "retrying"],
		[failed, "failed"],
	];
	return (
		<span className="sum">
			{paused ? <b className="paused">Paused · </b> : null}
			{parts
				.filter(([value]) => value > 0)
				.map(([value, label]) => (
					<span key={label}>
						<b>{value}</b> {label} ·{" "}
					</span>
				))}
			this batch{" "}
			<b>
				≈ <TokenAmount raw={wal} context="compact" /> WAL
			</b>
			{sui !== null ? (
				<>
					{" "}
					+{" "}
					<b>
						<TokenAmount raw={sui} context="compact" /> SUI
					</b>
				</>
			) : null}
		</span>
	);
}

function stoppedReason(item: TransferItem): string {
	return item.status.kind === "failed" ? item.status.error : "";
}
