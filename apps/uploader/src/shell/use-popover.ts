import {
	type RefObject,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";

const FOCUSABLE =
	'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface Popover {
	id: string;
	isOpen: boolean;
	open: () => void;
	toggle: () => void;
	close: (options?: { restoreFocus?: boolean }) => void;
	triggerRef: RefObject<HTMLButtonElement | null>;
	panelRef: RefObject<HTMLDivElement | null>;
}

/**
 * A non-modal popover anchored to a trigger button. Opening moves focus to
 * the first control inside; Escape closes and returns focus to the trigger;
 * a click or focus outside closes it without moving focus.
 */
export function usePopover(): Popover {
	const id = useId();
	const [isOpen, setIsOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	const close = useCallback(
		({ restoreFocus = true }: { restoreFocus?: boolean } = {}) => {
			setIsOpen(false);
			if (restoreFocus) triggerRef.current?.focus();
		},
		[],
	);
	const open = useCallback(() => setIsOpen(true), []);
	const toggle = useCallback(() => setIsOpen((value) => !value), []);

	useEffect(() => {
		if (!isOpen) return;
		const panel = panelRef.current;
		panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

		function isInside(target: EventTarget | null): boolean {
			if (!(target instanceof Node)) return false;
			return Boolean(
				panel?.contains(target) || triggerRef.current?.contains(target),
			);
		}
		function onKeyDown(event: KeyboardEvent) {
			if (event.key !== "Escape") return;
			event.preventDefault();
			close();
		}
		function onOutside(event: Event) {
			if (!isInside(event.target)) close({ restoreFocus: false });
		}

		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("pointerdown", onOutside);
		document.addEventListener("focusin", onOutside);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("pointerdown", onOutside);
			document.removeEventListener("focusin", onOutside);
		};
	}, [isOpen, close]);

	return { id, isOpen, open, toggle, close, triggerRef, panelRef };
}
