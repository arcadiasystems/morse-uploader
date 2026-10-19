import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * The palette's keyboard shortcuts, as its hints show them: ⌘K (Ctrl+K off
 * Apple keyboards) opens it, G then a letter goes somewhere, and E extends
 * the selection. Letters only count outside text fields and while no
 * dialog is open, so typing never triggers them.
 */
export type GoTarget =
	| "overview"
	| "files"
	| "expiring"
	| "timeline"
	| "transfers";

/** The second key of each "G then …" shortcut. */
export const GO_KEYS: Readonly<Record<string, GoTarget>> = {
	o: "overview",
	f: "files",
	e: "expiring",
	x: "timeline",
	t: "transfers",
};

/** How long after G the second key still counts. */
const SEQUENCE_MS = 1_500;

export type Shortcut =
	| { kind: "go"; target: GoTarget }
	| { kind: "wait-for-go" }
	| { kind: "extend-selected" };

/**
 * What a key press does, given whether G was just pressed: a G starts a
 * sequence, the next letter completes it, and E on its own extends the
 * selection. `null` when the key is not a shortcut.
 */
export function readShortcut(afterG: boolean, key: string): Shortcut | null {
	const letter = key.toLowerCase();
	if (afterG) {
		const target = GO_KEYS[letter];
		return target ? { kind: "go", target } : null;
	}
	if (letter === "g") return { kind: "wait-for-go" };
	if (letter === "e") return { kind: "extend-selected" };
	return null;
}

function isTyping(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable ||
			target.closest("input, textarea, select, [contenteditable]") !== null)
	);
}

/** Wires the shortcuts to the window for as long as the app is mounted. */
export function useShortcuts(handlers: {
	onPalette: () => void;
	onGo: (target: GoTarget) => void;
	onExtendSelected: () => void;
}): void {
	const latest = useRef(handlers);
	useLayoutEffect(() => {
		latest.current = handlers;
	});

	useEffect(() => {
		let gPressedAt = Number.NEGATIVE_INFINITY;
		function onKeyDown(event: KeyboardEvent) {
			if (
				event.key.toLowerCase() === "k" &&
				(event.metaKey || event.ctrlKey) &&
				!event.altKey &&
				!event.shiftKey
			) {
				event.preventDefault();
				latest.current.onPalette();
				return;
			}
			if (event.metaKey || event.ctrlKey || event.altKey || event.repeat)
				return;
			if (isTyping(event.target)) return;
			if (document.querySelector('[aria-modal="true"]')) return;
			const afterG = event.timeStamp - gPressedAt < SEQUENCE_MS;
			gPressedAt = Number.NEGATIVE_INFINITY;
			const shortcut = readShortcut(afterG, event.key);
			if (shortcut === null) return;
			event.preventDefault();
			switch (shortcut.kind) {
				case "wait-for-go":
					gPressedAt = event.timeStamp;
					return;
				case "go":
					latest.current.onGo(shortcut.target);
					return;
				case "extend-selected":
					latest.current.onExtendSelected();
					return;
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);
}
