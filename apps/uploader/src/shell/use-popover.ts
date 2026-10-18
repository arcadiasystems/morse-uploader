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
 * the first control inside; Escape closes and returns focus to the control
 * that opened it (a second trigger, such as the transfers pill and the rail
 * item, works too); a click or focus outside closes it without moving
 * focus. Every trigger sets `aria-controls` to the popover's id while it is
 * open, which is how a click on any of them counts as inside. Elements
 * matching `keepOpenWithin` count as inside too: a surface used alongside
 * the popover, such as the staging tray beside the transfers slide-over.
 */
export function usePopover({
	keepOpenWithin,
}: {
	keepOpenWithin?: string;
} = {}): Popover {
	const id = useId();
	const [isOpen, setIsOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	// The focused control when the popover opened, to return focus to.
	const openerRef = useRef<HTMLElement | null>(null);

	const rememberOpener = useCallback(() => {
		const active = document.activeElement;
		openerRef.current =
			active instanceof HTMLElement && active !== document.body ? active : null;
	}, []);
	const close = useCallback(
		({ restoreFocus = true }: { restoreFocus?: boolean } = {}) => {
			setIsOpen(false);
			if (!restoreFocus) return;
			const opener = openerRef.current;
			(opener?.isConnected ? opener : triggerRef.current)?.focus();
		},
		[],
	);
	const open = useCallback(() => {
		rememberOpener();
		setIsOpen(true);
	}, [rememberOpener]);
	const toggle = useCallback(() => {
		rememberOpener();
		setIsOpen((value) => !value);
	}, [rememberOpener]);

	useEffect(() => {
		if (!isOpen) return;
		const panel = panelRef.current;
		panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

		function isInside(target: EventTarget | null): boolean {
			if (!(target instanceof Element)) return false;
			return Boolean(
				panel?.contains(target) ||
					triggerRef.current?.contains(target) ||
					target.closest(`[aria-controls="${CSS.escape(id)}"]`) ||
					(keepOpenWithin !== undefined && target.closest(keepOpenWithin)),
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
	}, [isOpen, close, id, keepOpenWithin]);

	return { id, isOpen, open, toggle, close, triggerRef, panelRef };
}
