import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

const FOCUSABLE =
	'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus handling for a modal dialog: focus moves into it on open, Tab and
 * Shift+Tab cycle inside it, Escape closes it, and focus returns to what
 * had it before (the Upload button) when it closes.
 */
export function useModalFocus(
	dialog: RefObject<HTMLElement | null>,
	onClose: () => void,
): void {
	const close = useRef(onClose);
	useLayoutEffect(() => {
		close.current = onClose;
	});

	useEffect(() => {
		const element = dialog.current;
		if (!element) return;
		const previous =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		const focusables = () =>
			Array.from(element.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
				(node) => node.offsetParent !== null,
			);
		const autofocus = element.querySelector<HTMLElement>("[data-autofocus]");
		(autofocus ?? focusables()[0])?.focus();

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				event.preventDefault();
				close.current();
				return;
			}
			if (event.key !== "Tab") return;
			const nodes = focusables();
			const first = nodes[0];
			const last = nodes.at(-1);
			if (!first || !last) return;
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			previous?.focus();
		};
	}, [dialog]);
}
