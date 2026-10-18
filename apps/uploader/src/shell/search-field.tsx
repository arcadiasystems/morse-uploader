import { type KeyboardEvent, useEffect, useRef } from "react";

interface SearchFieldProps {
	query: string;
	onQueryChange: (query: string) => void;
	/** Disabled until a wallet is connected and there are blobs to search. */
	disabled: boolean;
}

/**
 * Searches the listed blobs by name, blob id and object id. ⌘K (Ctrl+K off
 * Apple keyboards) focuses it from anywhere; Escape clears it, then leaves.
 */
export function SearchField({
	query,
	onQueryChange,
	disabled,
}: SearchFieldProps) {
	const input = useRef<HTMLInputElement>(null);

	useEffect(() => {
		function onKeyDown(event: globalThis.KeyboardEvent) {
			if (event.key.toLowerCase() !== "k") return;
			if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey)
				return;
			const field = input.current;
			if (!field || field.disabled) return;
			event.preventDefault();
			field.focus();
			field.select();
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	function onEscape(event: KeyboardEvent<HTMLInputElement>) {
		if (event.key !== "Escape") return;
		event.preventDefault();
		if (query !== "") onQueryChange("");
		else event.currentTarget.blur();
	}

	return (
		<label className="cmd">
			<span aria-hidden="true">⌕</span>
			<input
				ref={input}
				type="search"
				placeholder="Search blobs, quilts, ids, or type a command"
				aria-label="Search blobs by name, blob id or object id"
				aria-keyshortcuts="Meta+K Control+K"
				value={query}
				onChange={(event) => onQueryChange(event.target.value)}
				onKeyDown={onEscape}
				disabled={disabled}
				spellCheck={false}
				autoComplete="off"
			/>
			<span className="keys" aria-hidden="true">
				<kbd>⌘K</kbd>
			</span>
		</label>
	);
}
