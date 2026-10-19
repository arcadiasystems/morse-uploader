import { useEffect, useState } from "react";

/**
 * The current time, updated every `intervalMs` while it is set, for text
 * that counts: a retry countdown, "read just now". `null` stops the clock.
 */
export function useNow(intervalMs: number | null): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (intervalMs === null) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(timer);
	}, [intervalMs]);
	return now;
}
