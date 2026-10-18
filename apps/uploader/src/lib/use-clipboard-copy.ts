import { useState } from "react";

export type CopyState = "idle" | "copied" | "failed";

/**
 * Copies text to the clipboard and remembers how it went. "failed" means the
 * browser refused (permissions or an insecure context); the caller shows how
 * to copy by hand.
 */
export function useClipboardCopy(): {
	state: CopyState;
	copy: (text: string) => Promise<void>;
} {
	const [state, setState] = useState<CopyState>("idle");

	async function copy(text: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			setState("copied");
		} catch {
			setState("failed");
		}
	}

	return { state, copy };
}
