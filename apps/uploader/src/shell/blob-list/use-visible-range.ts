import { type RefObject, useEffect, useState } from "react";

/** Rendered beyond each edge of the viewport, so fast scrolling never shows a gap. */
const OVERSCAN_PX = 600;

/**
 * The slice of a fixed-layout list that is on screen in `scroller`, given
 * each item's top. Only that slice is rendered, so a list of thousands of
 * blobs scrolls as smoothly as one of ten.
 */
export function useVisibleRange(
	scroller: RefObject<HTMLElement | null>,
	tops: readonly number[],
): { start: number; end: number } {
	const [viewport, setViewport] = useState({ top: 0, height: 0 });

	useEffect(() => {
		const element = scroller.current;
		if (!element) return;
		let frame = 0;
		const measure = () => {
			frame = 0;
			setViewport({ top: element.scrollTop, height: element.clientHeight });
		};
		const schedule = () => {
			if (frame === 0) frame = requestAnimationFrame(measure);
		};
		measure();
		element.addEventListener("scroll", schedule, { passive: true });
		const resize = new ResizeObserver(schedule);
		resize.observe(element);
		return () => {
			element.removeEventListener("scroll", schedule);
			resize.disconnect();
			cancelAnimationFrame(frame);
		};
	}, [scroller]);

	const start = lastAtOrAbove(tops, viewport.top - OVERSCAN_PX);
	const end = Math.min(
		tops.length,
		lastAtOrAbove(tops, viewport.top + viewport.height + OVERSCAN_PX) + 1,
	);
	return { start, end };
}

/** The index of the last top at or above `y`, or 0 when every top is below it. */
export function lastAtOrAbove(tops: readonly number[], y: number): number {
	let low = 0;
	let high = tops.length - 1;
	let found = 0;
	while (low <= high) {
		const middle = (low + high) >> 1;
		if ((tops[middle] ?? 0) <= y) {
			found = middle;
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}
	return found;
}
