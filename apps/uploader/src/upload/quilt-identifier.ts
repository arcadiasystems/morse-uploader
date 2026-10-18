/**
 * Quilt patch identifiers for files in a dropped folder, following the
 * strictest documented rules (PROTOCOL-NOTES section 2): the protocol
 * rejects empty identifiers, more than 65,535 bytes, trailing whitespace and
 * control characters; the docs also require an alphanumeric first character;
 * the SDK rejects duplicates. The SDK checks none of the first four, so the
 * app checks them all before anything is encoded.
 */

export type IdentifierProblem =
	| "empty"
	| "too-long"
	| "trailing-whitespace"
	| "control-character"
	| "first-character"
	| "duplicate";

/** Why a file cannot go into a quilt, as the staging tray says it. */
export const IDENTIFIER_PROBLEM_TEXT: Readonly<
	Record<IdentifierProblem, string>
> = {
	empty: "it has no name inside the folder",
	"too-long": "its path is longer than 65,535 bytes",
	"trailing-whitespace": "a file or folder name in its path ends with a space",
	"control-character": "its path contains a control character",
	"first-character": "its path must start with a letter or a digit",
	duplicate: "another file has the same path after Unicode normalization",
};

const MAX_IDENTIFIER_BYTES = 65_535;
// C0 controls, DEL and C1 controls: what `validate_quilt_identifier` rejects.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;
const ALPHANUMERIC_START = /^[A-Za-z0-9]/;
const TRAILING_WHITESPACE = /\s$/;
const UTF8 = new TextEncoder();

/**
 * The identifier for a file at `pathInFolder`, its POSIX path inside the
 * dropped folder (`assets/a.png` for `site-export/assets/a.png`): any
 * leading `./` or `/` removed, `/` separators kept, NFC-normalized so names
 * from macOS (often NFD) match the same name typed elsewhere.
 */
export function quiltIdentifier(pathInFolder: string): string {
	return pathInFolder.replace(/^(\.\/|\/)+/, "").normalize("NFC");
}

/** The first rule `identifier` breaks, apart from uniqueness, or `null`. */
export function identifierProblem(
	identifier: string,
): Exclude<IdentifierProblem, "duplicate"> | null {
	if (identifier === "") return "empty";
	if (UTF8.encode(identifier).length > MAX_IDENTIFIER_BYTES) return "too-long";
	if (CONTROL_CHARACTER.test(identifier)) return "control-character";
	// The protocol checks the end of the identifier; the notes extend that to
	// every segment, so a folder named "drafts " cannot hide in a path.
	if (
		identifier.split("/").some((segment) => TRAILING_WHITESPACE.test(segment))
	)
		return "trailing-whitespace";
	if (!ALPHANUMERIC_START.test(identifier)) return "first-character";
	return null;
}

export interface IdentifiedFile<T> {
	item: T;
	identifier: string;
}

export interface RejectedFile<T> {
	item: T;
	identifier: string;
	problem: IdentifierProblem;
}

/**
 * Maps folder paths to identifiers and sorts the files into those a quilt
 * accepts and those it cannot hold. A duplicate keeps the first file with
 * that identifier and rejects the rest, in input order.
 */
export function assignIdentifiers<T>(
	files: readonly { item: T; pathInFolder: string }[],
): { accepted: IdentifiedFile<T>[]; rejected: RejectedFile<T>[] } {
	const accepted: IdentifiedFile<T>[] = [];
	const rejected: RejectedFile<T>[] = [];
	const seen = new Set<string>();
	for (const { item, pathInFolder } of files) {
		const identifier = quiltIdentifier(pathInFolder);
		const problem =
			identifierProblem(identifier) ??
			(seen.has(identifier) ? "duplicate" : null);
		if (problem) {
			rejected.push({ item, identifier, problem });
			continue;
		}
		seen.add(identifier);
		accepted.push({ item, identifier });
	}
	return { accepted, rejected };
}
