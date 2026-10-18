export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Runs at most `concurrency` tasks at once; the rest wait in order. A task
 * that fails frees its slot like one that succeeds.
 * @throws {RangeError} When `concurrency` is not a positive integer.
 */
export function createLimiter(concurrency: number): Limiter {
	if (!Number.isInteger(concurrency) || concurrency < 1) {
		throw new RangeError("Concurrency must be a positive integer.");
	}
	let running = 0;
	const waiting: (() => void)[] = [];

	return async <T>(task: () => Promise<T>): Promise<T> => {
		if (running < concurrency) running += 1;
		// A finishing task hands its slot straight to the next waiter.
		else await new Promise<void>((resolve) => waiting.push(resolve));
		try {
			return await task();
		} finally {
			const next = waiting.shift();
			if (next) next();
			else running -= 1;
		}
	};
}
