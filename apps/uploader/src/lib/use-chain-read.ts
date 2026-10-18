import { useCallback, useEffect, useEffectEvent, useState } from "react";

export type ChainRead<T> =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ready"; data: T; readAt: Date; refreshing: boolean }
	| { status: "error"; error: unknown };

interface KeyedRead<T> {
	key: string | null;
	state: ChainRead<T>;
}

/**
 * Runs `read` whenever `key` changes, when the tab becomes visible again and
 * on `refresh()`. A new key starts from `loading`; a refresh of the same key
 * keeps the last data on screen while it runs. A `null` key means there is
 * nothing to read. Results that arrive after the key changed are dropped.
 */
export function useChainRead<T>(
	key: string | null,
	read: (signal: AbortSignal) => Promise<T>,
): { read: ChainRead<T>; refresh: () => void } {
	const [current, setCurrent] = useState<KeyedRead<T>>({
		key: null,
		state: { status: "idle" },
	});
	const [generation, setGeneration] = useState(0);
	const runRead = useEffectEvent(read);

	// biome-ignore lint/correctness/useExhaustiveDependencies: a new generation re-runs the read for refresh() and tab focus.
	useEffect(() => {
		if (key === null) return;
		const controller = new AbortController();
		setCurrent((previous) => ({
			key,
			state:
				previous.key === key && previous.state.status === "ready"
					? { ...previous.state, refreshing: true }
					: { status: "loading" },
		}));
		runRead(controller.signal).then(
			(data) => {
				if (controller.signal.aborted) return;
				setCurrent({
					key,
					state: {
						status: "ready",
						data,
						readAt: new Date(),
						refreshing: false,
					},
				});
			},
			(error: unknown) => {
				if (controller.signal.aborted) return;
				setCurrent({ key, state: { status: "error", error } });
			},
		);
		return () => controller.abort();
	}, [key, generation]);

	useEffect(() => {
		function onVisibilityChange() {
			if (document.visibilityState === "visible")
				setGeneration((value) => value + 1);
		}
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () =>
			document.removeEventListener("visibilitychange", onVisibilityChange);
	}, []);

	const refresh = useCallback(() => setGeneration((value) => value + 1), []);
	if (key === null) return { read: { status: "idle" }, refresh };
	// Between a key change and its effect, the previous key's data must not show.
	return {
		read: current.key === key ? current.state : { status: "loading" },
		refresh,
	};
}
