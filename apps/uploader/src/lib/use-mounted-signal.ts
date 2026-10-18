import { useCallback, useEffect, useRef } from "react";

/**
 * A signal that aborts when the component unmounts, for work started from
 * a click. The controller is made in the effect, so React's development
 * double mount gets a fresh one.
 */
export function useMountedSignal(): () => AbortSignal {
	const controller = useRef<AbortController | null>(null);
	useEffect(() => {
		const current = new AbortController();
		controller.current = current;
		return () => current.abort();
	}, []);
	return useCallback(() => {
		if (!controller.current) controller.current = new AbortController();
		return controller.current.signal;
	}, []);
}
