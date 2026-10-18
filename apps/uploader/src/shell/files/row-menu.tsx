import { type KeyboardEvent, useEffect, useRef } from "react";
import { blobByObjectIdUrl } from "@/blobs/aggregator-urls";
import type { BlobRow } from "@/blobs/blob-row";
import { useClipboardCopy } from "@/lib/use-clipboard-copy";
import type { NetworkConfig } from "@/network/networks";
import type { InspectorRequest } from "../inspector/inspector";
import type { InspectorTarget } from "../inspector/inspector-target";

/** What a row's menu asks the inspector for. */
export type InspectorAsk = Omit<InspectorRequest, "request">;

/** Actions a row's menu starts in the inspector, as the design's inspector orders them. */
const ASKS: readonly { label: string; ask: InspectorAsk }[] = [
	{ label: "Extend", ask: { section: "storage", action: "extend" } },
	{ label: "Share", ask: { section: "share", action: null } },
	{ label: "Verify", ask: { section: "verify", action: "verify" } },
	{ label: "Publish to Morse", ask: { section: "publish", action: null } },
];

/** What a quilt file's menu offers; storage and verify belong to its quilt. */
const FILE_ASKS = ASKS.filter(
	(item) => item.ask.section === "share" || item.ask.section === "publish",
);

/**
 * A row's overflow menu, anchored under its ⋯ button: open the inspector,
 * or start one of its actions (Extend opens the extend panel, Verify runs
 * the check), download through the aggregator, and copy the blob id.
 * Arrow keys move between items; Escape and Tab close it and return focus.
 */
export function RowMenu({
	target,
	anchor,
	network,
	onOpen,
	onClose,
}: {
	target: InspectorTarget;
	anchor: HTMLButtonElement;
	network: NetworkConfig;
	onOpen: (ask: InspectorAsk | null) => void;
	onClose: (restoreFocus: boolean) => void;
}) {
	const menu = useRef<HTMLDivElement>(null);
	const { state, copy } = useClipboardCopy();
	const rect = anchor.getBoundingClientRect();
	const row = target.kind === "blob" ? target.row : null;
	const asks = target.kind === "blob" ? ASKS : FILE_ASKS;

	useEffect(() => {
		menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
		function onOutside(event: PointerEvent) {
			if (
				event.target instanceof Node &&
				!menu.current?.contains(event.target) &&
				!anchor.contains(event.target)
			)
				onClose(false);
		}
		document.addEventListener("pointerdown", onOutside);
		return () => document.removeEventListener("pointerdown", onOutside);
	}, [anchor, onClose]);

	function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		const items = Array.from(
			menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [],
		);
		const active = document.activeElement;
		const index = active instanceof HTMLElement ? items.indexOf(active) : -1;
		const step =
			event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
		if (step !== 0) {
			event.preventDefault();
			items[(index + step + items.length) % items.length]?.focus();
		} else if (event.key === "Home" || event.key === "End") {
			event.preventDefault();
			(event.key === "Home" ? items[0] : items.at(-1))?.focus();
		} else if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			onClose(true);
		} else if (event.key === "Tab") {
			onClose(false);
		}
	}

	return (
		<div
			ref={menu}
			className="rmenu"
			role="menu"
			aria-label={`Actions for ${target.kind === "blob" ? target.row.label : target.identifier}`}
			style={{
				top: rect.bottom + 6,
				right: Math.max(8, window.innerWidth - rect.right),
			}}
			onKeyDown={onKeyDown}
		>
			<button type="button" role="menuitem" onClick={() => onOpen(null)}>
				Details
			</button>
			{asks.map((item) => (
				<button
					key={item.label}
					type="button"
					role="menuitem"
					onClick={() => onOpen(item.ask)}
				>
					{item.label}
				</button>
			))}
			{row && isDownloadable(row) ? (
				<a
					role="menuitem"
					href={blobByObjectIdUrl(network.aggregatorUrl, row.blob.objectId)}
					target="_blank"
					rel="noopener noreferrer"
					onClick={() => onClose(false)}
				>
					Download
				</a>
			) : null}
			{row ? (
				<button
					type="button"
					role="menuitem"
					onClick={() => copy(row.blob.blobId)}
				>
					{state === "copied"
						? "Blob id copied"
						: state === "failed"
							? "Copy blocked: the id is in the details"
							: "Copy blob id"}
				</button>
			) : null}
		</div>
	);
}

/**
 * A blob whose bytes an aggregator can serve as the file: certified, still
 * paid for, not a quilt (its files are read one by one) and not encrypted
 * (the bytes would be ciphertext).
 */
function isDownloadable(row: BlobRow): boolean {
	const live =
		row.status.kind === "certified" || row.status.kind === "expiring";
	return live && !row.blob.isQuilt && !row.blob.isEncrypted;
}
