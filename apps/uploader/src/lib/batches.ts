/**
 * Splitting work across transactions: each transaction is one wallet
 * prompt, so the signature count a surface shows is the batch count.
 */

/** Splits items into batches of at most `size`, in order. */
export function inBatches<T>(items: readonly T[], size: number): T[][] {
	if (!Number.isInteger(size) || size < 1)
		throw new RangeError("A batch holds at least one item.");
	const batches: T[][] = [];
	for (let start = 0; start < items.length; start += size)
		batches.push(items.slice(start, start + size));
	return batches;
}

/** Wallet prompts for `count` items at `perTransaction` each: one per transaction. */
export function signatureCount(count: number, perTransaction: number): number {
	if (!Number.isInteger(perTransaction) || perTransaction < 1)
		throw new RangeError("A transaction holds at least one item.");
	return Math.ceil(Math.max(0, count) / perTransaction);
}
