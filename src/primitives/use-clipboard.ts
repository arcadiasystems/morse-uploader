import { useCallback, useEffect, useRef, useState } from "react";
import type { UseClipboardResult } from "../types.js";

/**
 * Copy text to the clipboard and flag success for a short window so a button
 * can show "Copied". The `copied` flag resets after `resetMs`. No-op (returns
 * false) when the Clipboard API is unavailable or the write is rejected.
 */
export function useClipboard(resetMs = 2000): UseClipboardResult {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	useEffect(() => () => clearTimeout(timer.current), []);

	const copy = useCallback(
		async (text: string): Promise<boolean> => {
			if (
				typeof navigator === "undefined" ||
				navigator.clipboard === undefined
			) {
				return false;
			}
			try {
				await navigator.clipboard.writeText(text);
			} catch {
				return false;
			}
			setCopied(true);
			clearTimeout(timer.current);
			timer.current = setTimeout(() => setCopied(false), resetMs);
			return true;
		},
		[resetMs],
	);

	return { copied, copy };
}
