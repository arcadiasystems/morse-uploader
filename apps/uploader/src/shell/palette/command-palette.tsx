import {
	type KeyboardEvent,
	type ReactNode,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { type BlobRow, shortenBlobId } from "@/blobs/blob-row";
import { useModalFocus } from "../use-modal-focus";
import {
	type BlobMatch,
	matchBlobs,
	PALETTE_GROUPS,
	type PaletteEntry,
	type PaletteGroup,
	rankEntries,
} from "./palette-match";

/** A command the palette can run, with what it shows beside its title. */
export interface PaletteCommand extends PaletteEntry {
	/** A short fact after the title, such as "7 blobs · 0.0011 WAL". */
	detail?: ReactNode;
	/** The mark before the title. */
	mark: string;
	/** The keys that run it without the palette, as its hint shows them. */
	keys?: string;
	run: () => void;
}

const GROUP_TITLES: Readonly<Record<PaletteGroup, string>> = {
	actions: "Actions",
	goto: "Go to",
	blobs: "Blobs",
};

interface Option {
	key: string;
	group: PaletteGroup;
	mark: string;
	title: string;
	detail: ReactNode;
	keys: string | undefined;
	run: () => void;
}

/**
 * The command palette (design/v2/app-palette.html): search and actions in
 * one field. Typing ranks the actions and places that match, offers to
 * filter Files by the text, and lists the blobs a name, blob id or object
 * id names; a query about extending lists the blobs expiring soonest.
 * Arrow keys move, Enter runs, Escape closes, and focus stays inside until
 * it does.
 */
export function CommandPalette({
	commands,
	rows,
	onJump,
	onFilter,
	onClose,
}: {
	commands: readonly PaletteCommand[];
	/** The wallet's listed blobs, to jump to. */
	rows: readonly BlobRow[];
	onJump: (match: BlobMatch) => void;
	/** Filters the Files list by the typed text, as the Files filter box does. */
	onFilter: (query: string) => void;
	onClose: () => void;
}) {
	const ids = useId();
	const dialog = useRef<HTMLDivElement>(null);
	const list = useRef<HTMLDivElement>(null);
	useModalFocus(dialog, onClose);
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);

	const options = useMemo((): Option[] => {
		const ranked = rankEntries(query, commands);
		const byId = new Map(commands.map((command) => [command.id, command]));
		const commandOptions = ranked.flatMap((entry): Option[] => {
			const command = byId.get(entry.id);
			return command
				? [
						{
							key: command.id,
							group: command.group,
							mark: command.mark,
							title: command.title,
							detail: command.detail,
							keys: command.keys,
							run: command.run,
						},
					]
				: [];
		});
		const blobOptions = matchBlobs(query, rows).map(
			(match): Option => ({
				key: `blob:${match.row.blob.objectId}`,
				group: "blobs",
				mark: "▪",
				title: match.row.label,
				detail: blobDetail(match.row),
				keys: undefined,
				run: () => onJump(match),
			}),
		);
		const typed = query.trim();
		const filterOption: Option[] =
			typed === "" || rows.length === 0
				? []
				: [
						{
							key: "filter",
							// Last, so Enter on an exact command or blob runs that, not the filter.
							group: "blobs",
							mark: "⌕",
							title: `Filter Files by “${typed}”`,
							detail: undefined,
							keys: undefined,
							run: () => onFilter(typed),
						},
					];
		const all = [...commandOptions, ...blobOptions, ...filterOption];
		return PALETTE_GROUPS.flatMap((group) =>
			all.filter((option) => option.group === group),
		);
	}, [query, commands, rows, onJump, onFilter]);

	const current = Math.min(active, Math.max(0, options.length - 1));
	const optionId = (index: number) => `${ids}-option-${index}`;
	const activeId = options.length > 0 ? optionId(current) : null;

	// The active option stays in view as the arrow keys move it.
	useEffect(() => {
		if (activeId === null) return;
		list.current
			?.querySelector(`#${CSS.escape(activeId)}`)
			?.scrollIntoView({ block: "nearest" });
	}, [activeId]);

	function run(option: Option | undefined) {
		if (!option) return;
		onClose();
		option.run();
	}

	function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		const count = options.length;
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			if (count === 0) return;
			const step = event.key === "ArrowDown" ? 1 : -1;
			setActive((current + step + count) % count);
		} else if (event.key === "Enter") {
			event.preventDefault();
			run(options[current]);
		}
	}

	return (
		<div
			className="pal-layer"
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				className="pal"
				role="dialog"
				aria-modal="true"
				aria-label="Command palette"
				ref={dialog}
			>
				<div className="in">
					<span aria-hidden="true">⌕</span>
					<input
						type="text"
						role="combobox"
						aria-label="Search blobs or type a command"
						aria-expanded="true"
						aria-controls={`${ids}-list`}
						aria-autocomplete="list"
						aria-activedescendant={activeId ?? undefined}
						placeholder="Search blobs, quilts, ids, or type a command"
						value={query}
						spellCheck={false}
						autoComplete="off"
						onChange={(event) => {
							setQuery(event.currentTarget.value);
							setActive(0);
						}}
						onKeyDown={onKeyDown}
					/>
				</div>
				<div
					className="results"
					id={`${ids}-list`}
					role="listbox"
					aria-label="Commands and blobs"
					ref={list}
				>
					{options.length === 0 ? (
						<p className="none">
							Nothing matches “{query.trim()}”. Try a blob name, a blob id or
							object id, or a word like extend.
						</p>
					) : (
						PALETTE_GROUPS.map((group) => {
							const inGroup = options
								.map((option, index) => ({ option, index }))
								.filter(({ option }) => option.group === group);
							if (inGroup.length === 0) return null;
							return (
								// biome-ignore lint/a11y/useSemanticElements: a listbox groups its options with role group (WAI-ARIA APG listbox); a fieldset is a form control.
								<div
									key={group}
									className="grp"
									role="group"
									aria-labelledby={`${ids}-${group}`}
								>
									<h5 id={`${ids}-${group}`}>{GROUP_TITLES[group]}</h5>
									{inGroup.map(({ option, index }) => (
										<div
											key={option.key}
											id={optionId(index)}
											role="option"
											tabIndex={-1}
											aria-selected={index === current}
											className={index === current ? "it on" : "it"}
											onPointerMove={() => setActive(index)}
											onClick={() => run(option)}
											onKeyDown={(event) => {
												if (event.key === "Enter") run(option);
											}}
										>
											<span className="mk" aria-hidden="true">
												{option.mark}
											</span>
											<span className="tt">
												{option.title}
												{option.detail ? (
													<small> · {option.detail}</small>
												) : null}
											</span>
											{index === current ? (
												<span aria-hidden="true">
													<kbd>↵</kbd>
												</span>
											) : option.keys ? (
												<span aria-hidden="true">
													<kbd>{option.keys}</kbd>
												</span>
											) : (
												<span />
											)}
										</div>
									))}
								</div>
							);
						})
					)}
				</div>
			</div>
		</div>
	);
}

/** A blob's short id and how long its storage has left, as the design lists it. */
function blobDetail(row: BlobRow): string {
	const { kind, daysLeft } = row.status;
	const left =
		kind === "expired"
			? "expired"
			: kind === "registered"
				? "not certified"
				: daysLeft < 1
					? "< 1 d left"
					: `${daysLeft} d left`;
	return `${shortenBlobId(row.blob.blobId)} · ${left}`;
}
