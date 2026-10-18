import { describe, expect, it } from "vitest";
import {
	encodedBlobSize,
	sourceSymbols,
	storageUnits,
	symbolSizeFor,
} from "./encoded-size";

const SHARDS = 1000;

describe("sourceSymbols", () => {
	it("gives 334 primary and 667 secondary symbols on 1000 shards (notes section 1)", () => {
		expect(sourceSymbols(SHARDS)).toEqual({ primary: 334, secondary: 667 });
	});
});

describe("encodedBlobSize", () => {
	it("bills a 1-byte blob for the fixed 64,032,000 bytes of metadata plus two symbols", () => {
		expect(symbolSizeFor(1, SHARDS)).toBe(2);
		expect(encodedBlobSize(1, SHARDS)).toBe(64_032_000n + 1_001_000n * 2n);
	});

	it("encodes an empty blob like a 1-byte one", () => {
		expect(encodedBlobSize(0, SHARDS)).toBe(encodedBlobSize(1, SHARDS));
	});

	// The notes' worked values (section 3), two of them checked against chain.
	it.each([
		[1_048_576, 70_038_000n, 67n],
		[1_200_000, 70_038_000n, 67n],
		[4_100_000, 84_052_000n, 81n],
		[96_000_000, 496_464_000n, 474n],
		[1_073_741_824, 4_888_852_000n, 4_663n],
		[1_782_224, 72_040_000n, 69n],
	])("encodes %d bytes as %d bytes in %d units", (size, encoded, units) => {
		expect(encodedBlobSize(size, SHARDS)).toBe(encoded);
		expect(storageUnits(encoded)).toBe(units);
	});

	it("rounds an odd symbol count up for RS2 alignment", () => {
		const oneSymbol = 334 * 667;
		expect(symbolSizeFor(oneSymbol, SHARDS)).toBe(2);
		expect(symbolSizeFor(2 * oneSymbol, SHARDS)).toBe(2);
		expect(symbolSizeFor(2 * oneSymbol + 1, SHARDS)).toBe(4);
	});
});

describe("storageUnits", () => {
	it("counts started MiB", () => {
		expect(storageUnits(1n)).toBe(1n);
		expect(storageUnits(1_048_576n)).toBe(1n);
		expect(storageUnits(1_048_577n)).toBe(2n);
	});
});
