import { type KeyboardEvent, useId, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { TokenAmount } from "@/components/token-amount";
import { errorMessage } from "@/lib/error-message";
import { formatBytes } from "@/lib/format-bytes";
import { useNow } from "@/lib/use-now";
import {
	type TransferItem,
	type TransferTab,
	tabOf,
} from "@/transfers/transfer-state";
import {
	formatDuration,
	type TransfersStrip,
	transfersStrip,
} from "@/transfers/transfer-view";
import type { TransferQueueHandle } from "@/transfers/use-transfer-queue";
import type { Popover } from "../use-popover";
import { TransferRow } from "./transfer-row";

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

/**
 * The transfers slide-over (design/v2/app-transfers.html, handover item
 * 3), opened by the top bar's pill or the rail: Queue, Done and Failed,
 * the summary strip (remaining, throughput, this batch's cost and its
 * signatures), each item's five steps, and Pause all, which holds the
 * queue between steps so no new wallet request appears.
 */
export function TransfersPanel({
	panel,
	transfers,
}: {
	panel: Popover;
	transfers: TransferQueueHandle;
}) {
	if (!panel.isOpen) return null;
	return (
		<div
			ref={panel.panelRef}
			id={panel.id}
			className="tpanel"
			role="dialog"
			aria-label="Transfers"
		>
			<TransfersPane transfers={transfers} onClose={() => panel.close()} />
		</div>
	);
}

function TransfersPane({
	transfers,
	onClose,
}: {
	transfers: TransferQueueHandle;
	onClose: () => void;
}) {
	const ids = useId();
	const { queue, state, restoreError } = transfers;
	const [tab, setTab] = useState<TransferTab>("queue");
	const tabRefs = useRef(new Map<TransferTab, HTMLButtonElement>());
	const byTab = (id: TransferTab) =>
		state.items.filter((item) => tabOf(item) === id);
	const shown = byTab(tab);
	const counting = state.items.some((item) => item.status.kind === "retrying");
	// A retry countdown ticks every second; otherwise the clock rests.
	const nowMs = useNow(counting ? 1000 : null);

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

	const pending = byTab("queue").length > 0;
	// The most recent stopped item, announced to screen readers.
	const stopped = state.items
		.filter((item) => item.status.kind === "failed")
		.at(-1);
	return (
		<>
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
				<button
					className="pause"
					type="button"
					disabled={!pending && !state.paused}
					aria-pressed={state.paused}
					onClick={() => (state.paused ? queue.resume() : queue.pause())}
				>
					{state.paused ? "Resume all" : "Pause all"}
				</button>
				<button
					className="x"
					type="button"
					aria-label="Close transfers"
					onClick={onClose}
				>
					<Icon name="close" size={16} />
				</button>
			</div>
			<Strip
				strip={transfersStrip(state)}
				active={pending}
				paused={state.paused}
			/>
			<div
				className="list"
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
					<ul className="txs">
						{shown.map((item) => (
							<TransferRow
								key={item.id}
								item={item}
								paused={state.paused}
								nowMs={nowMs}
								onRetry={(id) => queue.retry(id)}
								onDismiss={(id) => queue.dismiss(id)}
							/>
						))}
					</ul>
				)}
			</div>
		</>
	);
}

/** Remaining, throughput, this batch and its signatures, as the design's strip. */
function Strip({
	strip,
	active,
	paused,
}: {
	strip: TransfersStrip;
	active: boolean;
	paused: boolean;
}) {
	const { remainingSeconds, throughput, batch } = strip;
	return (
		<dl className="sum">
			<div>
				<dt>Remaining</dt>
				<dd>
					{paused && active ? (
						"paused"
					) : remainingSeconds === null ? (
						<Unknown spoken="not measured yet" />
					) : (
						formatDuration(remainingSeconds)
					)}
				</dd>
			</div>
			<div>
				<dt>Throughput</dt>
				<dd>
					{throughput === null ? (
						<Unknown spoken="not measured yet" />
					) : (
						`${formatBytes(BigInt(Math.round(throughput)))}/s`
					)}
				</dd>
			</div>
			<div>
				<dt>This batch</dt>
				<dd>
					{batch ? (
						<>
							<TokenAmount raw={batch.walFrost} context="compact" /> WAL
							{batch.suiMist !== null ? (
								<small>
									+ <TokenAmount raw={batch.suiMist} context="compact" /> SUI
								</small>
							) : null}
						</>
					) : (
						<Unknown spoken="no batch yet" />
					)}
				</dd>
			</div>
			<div>
				<dt>Signatures</dt>
				<dd>
					{batch ? (
						`${batch.signed} / ${batch.total}`
					) : (
						<Unknown spoken="no batch yet" />
					)}
				</dd>
			</div>
		</dl>
	);
}

function Unknown({ spoken }: { spoken: string }) {
	return (
		<>
			<span aria-hidden="true">--</span>
			<span className="sr-only">{spoken}</span>
		</>
	);
}

function stoppedReason(item: TransferItem): string {
	return item.status.kind === "failed" ? item.status.error : "";
}
