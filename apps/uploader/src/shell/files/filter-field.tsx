import type { KeyboardEvent } from "react";

/**
 * The Files filter box, always on screen beside the chips: it narrows the
 * list to blobs whose name, blob id or object id contain the text. Escape
 * clears it, then leaves it. The ⌘K palette searches and acts across the
 * app; this box only filters the list.
 */
export function FilterField({
	query,
	onQueryChange,
	disabled,
}: {
	query: string;
	onQueryChange: (query: string) => void;
	/** Disabled until a wallet is connected and there are blobs to filter. */
	disabled: boolean;
}) {
	function onEscape(event: KeyboardEvent<HTMLInputElement>) {
		if (event.key !== "Escape") return;
		event.preventDefault();
		event.stopPropagation();
		if (query !== "") onQueryChange("");
		else event.currentTarget.blur();
	}

	return (
		<label className="ffield">
			<span aria-hidden="true">⌕</span>
			<input
				type="search"
				placeholder="Filter by name or id"
				aria-label="Search blobs by name, blob id or object id"
				value={query}
				onChange={(event) => onQueryChange(event.target.value)}
				onKeyDown={onEscape}
				disabled={disabled}
				spellCheck={false}
				autoComplete="off"
			/>
		</label>
	);
}
