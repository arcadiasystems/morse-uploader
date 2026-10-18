import { type KeyboardEvent, useId, useRef, useState } from "react";

const TABS = {
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
} as const;

type TabId = keyof typeof TABS;
const TAB_IDS = Object.keys(TABS) as TabId[];

/** The transfer queue region. Arrow keys move between its tabs. */
export function TransferQueue() {
	const ids = useId();
	const [tab, setTab] = useState<TabId>("queue");
	const tabRefs = useRef(new Map<TabId, HTMLButtonElement>());

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
					{TAB_IDS.map((id) => (
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
						</button>
					))}
				</div>
				<span className="sum">Nothing in progress</span>
				<button className="btn btn-ghost xs pause" type="button" disabled>
					Pause all
				</button>
			</div>
			<div
				className="qlist"
				role="tabpanel"
				id={`${ids}-panel`}
				aria-labelledby={`${ids}-${tab}`}
			>
				<p className="qempty">{TABS[tab].empty}</p>
			</div>
		</section>
	);
}
