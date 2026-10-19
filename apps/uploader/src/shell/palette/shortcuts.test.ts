import { describe, expect, it } from "vitest";
import { GO_KEYS, readShortcut } from "./shortcuts";

describe("readShortcut", () => {
	it("starts a go sequence on G", () => {
		expect(readShortcut(false, "g")).toEqual({ kind: "wait-for-go" });
		expect(readShortcut(false, "G")).toEqual({ kind: "wait-for-go" });
	});

	it("goes where the second key says, as the palette's hints show", () => {
		expect(GO_KEYS).toEqual({
			o: "overview",
			f: "files",
			e: "expiring",
			x: "timeline",
			t: "transfers",
		});
		for (const [key, target] of Object.entries(GO_KEYS)) {
			expect(readShortcut(true, key)).toEqual({ kind: "go", target });
			expect(readShortcut(true, key.toUpperCase())).toEqual({
				kind: "go",
				target,
			});
		}
	});

	it("ignores an unknown second key", () => {
		expect(readShortcut(true, "q")).toBeNull();
		expect(readShortcut(true, "g")).toBeNull();
	});

	it("extends the selection on E alone", () => {
		expect(readShortcut(false, "e")).toEqual({ kind: "extend-selected" });
		expect(readShortcut(false, "E")).toEqual({ kind: "extend-selected" });
	});

	it("ignores other keys", () => {
		for (const key of ["o", "x", "k", "Enter", "ArrowDown", " "])
			expect(readShortcut(false, key)).toBeNull();
	});
});
