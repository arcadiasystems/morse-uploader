import { type ReactNode, useId, useRef } from "react";
import type { BlobRow } from "@/blobs/blob-row";
import {
	groupLeftOut,
	type LeftOut,
	leftOutText,
} from "@/manage/bulk-eligibility";
import { useModalFocus } from "../use-modal-focus";

/** Names shown before "and N more". */
const NAMES_SHOWN = 6;

/**
 * The frame every bulk action opens: a modal sheet with what the action
 * covers on the left and its cost, result and buttons on the right. Focus
 * moves in on open, Tab stays inside, Escape closes, and focus returns to
 * the bulk bar.
 */
export function BulkSheet({
	title,
	intro,
	children,
	aside,
	onClose,
}: {
	title: string;
	intro: ReactNode;
	/** What the action covers: the blobs, the left-out ones, the options. */
	children: ReactNode;
	/** The cost, the result and the buttons. */
	aside: ReactNode;
	onClose: () => void;
}) {
	const ids = useId();
	const dialog = useRef<HTMLDivElement>(null);
	useModalFocus(dialog, onClose);
	return (
		<div className="scrim">
			<div
				className="modal bulk-sheet"
				role="dialog"
				aria-modal="true"
				aria-labelledby={`${ids}-title`}
				ref={dialog}
			>
				<div className="l">
					<h2 id={`${ids}-title`}>{title}</h2>
					<p>{intro}</p>
					{children}
				</div>
				<div className="r">{aside}</div>
			</div>
		</div>
	);
}

/** Blob names, as many as fit, then how many more. */
export function rowNames(rows: readonly BlobRow[]): string {
	const shown = rows.slice(0, NAMES_SHOWN).map((row) => row.label);
	const more = rows.length - shown.length;
	return more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(", ");
}

/**
 * The selected blobs an action leaves out, grouped by why: "2 storage
 * ended: a.txt, b.png". Nothing renders when every blob is taken.
 */
export function LeftOutList({
	leftOut,
	maxEpochsAhead,
}: {
	leftOut: readonly LeftOut[];
	maxEpochsAhead: number;
}) {
	if (leftOut.length === 0) return null;
	return (
		<div className="leftout-list">
			<h4>
				{leftOut.length === 1
					? "1 selected blob is left out"
					: `${leftOut.length} selected blobs are left out`}
			</h4>
			<ul>
				{groupLeftOut(leftOut).map((group) => (
					<li key={group.reason}>
						<b>
							{group.rows.length} {leftOutText(group.reason, maxEpochsAhead)}
						</b>
						: {rowNames(group.rows)}
					</li>
				))}
			</ul>
		</div>
	);
}
