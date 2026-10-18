import { useEffect, useId, useRef } from "react";
import { useClipboardCopy } from "@/lib/use-clipboard-copy";

/**
 * A value to copy: a read-only field and a Copy button. The button writes
 * with `navigator.clipboard` in its click handler. When the browser refuses,
 * the field's text is selected so the viewer can copy it by hand.
 */
export function CopyField({
	label,
	value,
	multiline = false,
}: {
	label: string;
	value: string;
	multiline?: boolean;
}) {
	const id = useId();
	const { state, copy } = useClipboardCopy();
	const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

	// After a refused write, select the text so ⌘C or Ctrl+C copies it.
	useEffect(() => {
		if (state === "failed") field.current?.select();
	}, [state]);

	return (
		<div className="copy-field">
			<label htmlFor={id}>{label}</label>
			<div className="line">
				{multiline ? (
					<textarea id={id} ref={field} readOnly rows={2} value={value} />
				) : (
					<input id={id} ref={field} readOnly value={value} />
				)}
				<button
					className="btn btn-soft xs"
					type="button"
					aria-label={`Copy ${label.toLowerCase()}`}
					onClick={() => copy(value)}
				>
					{state === "copied" ? "Copied" : "Copy"}
				</button>
			</div>
			{state === "failed" ? (
				<span className="note" role="status">
					The browser blocked the clipboard. The text is selected: press ⌘C or
					Ctrl+C to copy it.
				</span>
			) : (
				<span className="sr-only" role="status">
					{state === "copied" ? `${label} copied` : ""}
				</span>
			)}
		</div>
	);
}
