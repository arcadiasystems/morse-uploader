import { describe, expect, it } from "vitest";
import type { BlobRow } from "./blob-row";
import { blobRow } from "./fixtures";
import { DEFAULT_SORT, nextSort, sortRows } from "./sort-rows";

const labels = (rows: readonly BlobRow[]) => rows.map((row) => row.label);

describe("sortRows", () => {
	const alpha = blobRow({
		name: "alpha.txt",
		size: 300n,
		endEpoch: 603,
		registeredEpoch: 550,
	});
	const beta10 = blobRow({
		name: "Beta 10.txt",
		size: 20n,
		endEpoch: 556,
		registeredEpoch: 553,
	});
	const beta9 = blobRow({
		name: "beta 9.txt",
		size: 4_000n,
		endEpoch: 474,
		registeredEpoch: 470,
	});
	const gamma = blobRow({
		name: "gamma.txt",
		size: 300n,
		endEpoch: 600,
		certifiedEpoch: null,
		registeredEpoch: 552,
	});
	const rows = [gamma, beta10, alpha, beta9];

	it("sorts names naturally and without regard to case", () => {
		expect(
			labels(sortRows(rows, { key: "name", direction: "ascending" })),
		).toEqual(["alpha.txt", "beta 9.txt", "Beta 10.txt", "gamma.txt"]);
		expect(
			labels(sortRows(rows, { key: "name", direction: "descending" })),
		).toEqual(["gamma.txt", "Beta 10.txt", "beta 9.txt", "alpha.txt"]);
	});

	it("sorts by size, breaking ties by expiry", () => {
		expect(
			labels(sortRows(rows, { key: "size", direction: "descending" })),
		).toEqual([
			"beta 9.txt",
			// Same size: the one that expires first comes first.
			"gamma.txt",
			"alpha.txt",
			"Beta 10.txt",
		]);
		expect(
			labels(sortRows(rows, { key: "size", direction: "ascending" })),
		).toEqual(["Beta 10.txt", "gamma.txt", "alpha.txt", "beta 9.txt"]);
	});

	it("sorts by the end epoch", () => {
		expect(
			labels(sortRows(rows, { key: "expiry", direction: "ascending" })),
		).toEqual(["beta 9.txt", "Beta 10.txt", "gamma.txt", "alpha.txt"]);
		expect(
			labels(sortRows(rows, { key: "expiry", direction: "descending" })),
		).toEqual(["alpha.txt", "gamma.txt", "Beta 10.txt", "beta 9.txt"]);
	});

	it("puts the newest upload first by default, by registered epoch", () => {
		expect(labels(sortRows(rows, DEFAULT_SORT))).toEqual([
			"Beta 10.txt",
			"gamma.txt",
			"alpha.txt",
			"beta 9.txt",
		]);
		expect(
			labels(sortRows(rows, { key: "uploaded", direction: "ascending" })),
		).toEqual(["beta 9.txt", "alpha.txt", "gamma.txt", "Beta 10.txt"]);
	});

	it("does not reorder its input", () => {
		const input = [...rows];
		sortRows(input, { key: "name", direction: "ascending" });
		expect(input).toEqual(rows);
	});
});

describe("nextSort", () => {
	it("flips the sorted column and starts a new one in its first direction", () => {
		expect(DEFAULT_SORT).toEqual({ key: "uploaded", direction: "descending" });
		expect(nextSort(DEFAULT_SORT, "uploaded")).toEqual({
			key: "uploaded",
			direction: "ascending",
		});
		expect(nextSort(DEFAULT_SORT, "expiry")).toEqual({
			key: "expiry",
			direction: "ascending",
		});
		expect(nextSort(DEFAULT_SORT, "name")).toEqual({
			key: "name",
			direction: "ascending",
		});
		expect(nextSort(DEFAULT_SORT, "size")).toEqual({
			key: "size",
			direction: "descending",
		});
	});
});
