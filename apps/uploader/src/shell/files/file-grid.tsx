import { useLayoutEffect, useRef } from "react";
import type { BlobRow } from "@/blobs/blob-row";
import { formatBytes } from "@/lib/format-bytes";
import { BlobIcon, BlobName, MenuButton, StorageLeft } from "./file-row";

/**
 * The Files grid: one card per blob with its icon, name, size and storage
 * left. Opening a card shows its details; a quilt's files open from there
 * or from the list view.
 */
export function FileGrid({
	label,
	rows,
	activeKey,
	onActivate,
	checked,
	onCheck,
	onMenu,
	reveal,
}: {
	label: string;
	rows: readonly BlobRow[];
	activeKey: string | null;
	onActivate: (key: string) => void;
	checked: ReadonlySet<string>;
	onCheck: (objectId: string) => void;
	onMenu: (key: string, trigger: HTMLButtonElement) => void;
	/** A card to scroll into view and focus, from a jump; `request` grows with each. */
	reveal: { key: string; request: number } | null;
}) {
	const list = useRef<HTMLUListElement>(null);
	const revealed = useRef(0);
	useLayoutEffect(() => {
		if (reveal === null || reveal.request === revealed.current) return;
		const card = list.current?.querySelector<HTMLElement>(
			`[data-key="${CSS.escape(reveal.key)}"]`,
		);
		if (!card) return;
		revealed.current = reveal.request;
		card.scrollIntoView({ block: "center" });
		card.querySelector<HTMLElement>(".open")?.focus({ preventScroll: true });
	}, [reveal]);
	return (
		<ul className="cards" aria-label={label} ref={list}>
			{rows.map((row) => {
				const { objectId } = row.blob;
				const classes = [
					"fcardg",
					objectId === activeKey ? "sel" : "",
					row.status.kind === "expired" ? "exp" : "",
				]
					.filter(Boolean)
					.join(" ");
				return (
					<li key={objectId} className={classes} data-key={objectId}>
						<input
							type="checkbox"
							className="cb"
							checked={checked.has(objectId)}
							aria-label={`Select ${row.label}`}
							onChange={() => onCheck(objectId)}
						/>
						<MenuButton
							label={row.label}
							onOpen={(trigger) => onMenu(objectId, trigger)}
						/>
						<button
							type="button"
							className="open"
							aria-current={objectId === activeKey ? "true" : undefined}
							onClick={() => onActivate(objectId)}
						>
							<span className="tile">
								<BlobIcon row={row} />
							</span>
							<span className="nm">
								<BlobName row={row} />
							</span>
							<span className="sz">{formatBytes(row.blob.size)}</span>
							<span className="life">
								<StorageLeft row={row} />
							</span>
						</button>
					</li>
				);
			})}
		</ul>
	);
}
