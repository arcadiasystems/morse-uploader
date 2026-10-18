import { ulebLength } from "@/lib/uleb-length";
import { MAX_SYMBOL_BYTES, sourceSymbols } from "./encoded-size";

/**
 * The size of a quilt before it is encoded, computed from file sizes and
 * names without reading any bytes. It follows `encodeQuilt` in
 * `@mysten/walrus` 1.2.35 (`utils/quilts.mjs`), which PROTOCOL-NOTES
 * section 3 suggests replicating: every file takes whole columns of a
 * `primary × secondary` symbol matrix, the index takes the first columns,
 * and the quilt is billed as a blob of `symbol × primary × secondary` bytes.
 */

/** One file in a quilt, as the layout sees it. */
export interface QuiltPatchShape {
	identifier: string;
	tags: Readonly<Record<string, string>>;
	contentBytes: number;
}

export type QuiltLayout =
	| {
			ok: true;
			symbolSize: number;
			/** Bytes of the quilt blob: what the relay receives and storage is billed on. */
			bodyBytes: number;
	  }
	| { ok: false; problem: QuiltLayoutProblem };

export type QuiltLayoutProblem =
	/** More files than columns: at most `secondary - 1` (666 on 1000 shards). */
	| "too-many-files"
	/** A symbol would exceed 65,534 bytes. */
	| "oversize";

/** `QUILT_INDEX_PREFIX_SIZE`: a version byte and a u32 index length. */
const INDEX_PREFIX_BYTES = 5;
/** `QuiltPatchBlobHeader`: version u8, length u32, mask u8. */
const PATCH_HEADER_BYTES = 6;
/** The u16 length written before the identifier and before the tags. */
const LENGTH_FIELD_BYTES = 2;
/** `MAX_NUM_SLIVERS_FOR_QUILT_INDEX`. */
const MAX_INDEX_COLUMNS = 10;
/** RS2 symbols are aligned to two bytes. */
const SYMBOL_ALIGNMENT = 2;
/** The `endIndex` u16 of each `QuiltPatchV1` in the index. */
const INDEX_END_FIELD_BYTES = 2;

const UTF8 = new TextEncoder();

/** The most files one quilt holds on `nShards` shards: one column each, plus the index. */
export function maxQuiltFiles(nShards: number): number {
	return sourceSymbols(nShards).secondary - 1;
}

export function quiltLayout(
	patches: readonly QuiltPatchShape[],
	nShards: number,
): QuiltLayout {
	const { primary: rows, secondary: columns } = sourceSymbols(nShards);
	if (patches.length === 0 || patches.length > maxQuiltFiles(nShards))
		return { ok: false, problem: "too-many-files" };

	const indexBytes =
		INDEX_PREFIX_BYTES +
		ulebLength(patches.length) +
		patches.reduce(
			(total, patch) =>
				total +
				INDEX_END_FIELD_BYTES +
				bcsStringLength(patch.identifier) +
				tagsLength(patch.tags),
			0,
		);
	const sizes = [indexBytes, ...patches.map(patchBytes)];
	const symbolSize = minimumSymbolSize(sizes, columns, rows);
	if (symbolSize === null || symbolSize > MAX_SYMBOL_BYTES)
		return { ok: false, problem: "oversize" };
	return { ok: true, symbolSize, bodyBytes: symbolSize * rows * columns };
}

/** A file's bytes in the quilt: header, identifier, tags when there are any, contents. */
function patchBytes(patch: QuiltPatchShape): number {
	const tags =
		Object.keys(patch.tags).length > 0
			? LENGTH_FIELD_BYTES + tagsLength(patch.tags)
			: 0;
	return (
		PATCH_HEADER_BYTES +
		LENGTH_FIELD_BYTES +
		bcsStringLength(patch.identifier) +
		tags +
		patch.contentBytes
	);
}

/**
 * The smallest even symbol size at which every entry fits in whole columns
 * and the index fits in at most 10 columns, found by the same binary search
 * as the SDK's `computeSymbolSize`, so the result matches it exactly. Long
 * paths therefore grow the symbol size rather than overflow the index.
 * `null` when nothing fits.
 */
function minimumSymbolSize(
	sizes: readonly number[],
	columns: number,
	rows: number,
): number | null {
	const [indexBytes = 0] = sizes;
	const total = sizes.reduce((sum, size) => sum + size, 0);
	let low = Math.max(
		total / (columns * rows),
		indexBytes / (rows * MAX_INDEX_COLUMNS),
		Math.ceil(INDEX_PREFIX_BYTES / rows),
	);
	let high = Math.ceil((Math.max(...sizes) / (columns / sizes.length)) * rows);
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		if (fitsInColumns(sizes, columns, middle * rows)) high = middle;
		else low = middle + 1;
	}
	const symbolSize = Math.ceil(low / SYMBOL_ALIGNMENT) * SYMBOL_ALIGNMENT;
	return fitsInColumns(sizes, columns, symbolSize * rows) ? symbolSize : null;
}

function fitsInColumns(
	sizes: readonly number[],
	columns: number,
	columnBytes: number,
): boolean {
	return (
		sizes.reduce((used, size) => used + Math.ceil(size / columnBytes), 0) <=
		columns
	);
}

/** BCS `map<string, string>`: a length, then each key and value as strings. */
function tagsLength(tags: Readonly<Record<string, string>>): number {
	const entries = Object.entries(tags);
	return entries.reduce(
		(total, [key, value]) =>
			total + bcsStringLength(key) + bcsStringLength(value),
		ulebLength(entries.length),
	);
}

/** BCS `string`: a ULEB128 byte length, then the UTF-8 bytes. */
function bcsStringLength(value: string): number {
	const bytes = UTF8.encode(value).length;
	return ulebLength(bytes) + bytes;
}
