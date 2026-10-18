import { describe, expect, it } from "vitest";
import {
	fileNameFromContentDisposition,
	isQuilt,
	isSealEncrypted,
	NAME_ATTRIBUTE,
	nameFromAttributes,
	SEAL_ATTRIBUTE,
} from "./blob-attributes";

describe("blob attributes", () => {
	it("detects quilts by the attribute every Walrus client writes", () => {
		expect(isQuilt({ _walrusBlobType: "quilt" })).toBe(true);
		expect(isQuilt({ _walrusBlobType: "blob" })).toBe(false);
		expect(isQuilt({})).toBe(false);
	});

	it("marks a blob encrypted only when the Seal attribute holds a value", () => {
		expect(SEAL_ATTRIBUTE).toBe("seal");
		expect(isSealEncrypted({ seal: "0x4687" })).toBe(true);
		expect(isSealEncrypted({ seal: "  " })).toBe(false);
		expect(isSealEncrypted({})).toBe(false);
	});

	it("names a blob from its name attribute first, then Content-Disposition", () => {
		expect(NAME_ATTRIBUTE).toBe("name");
		expect(
			nameFromAttributes({
				name: " hero.png ",
				"content-disposition": 'attachment; filename="other.png"',
			}),
		).toBe("hero.png");
		expect(
			nameFromAttributes({
				"content-disposition": 'attachment; filename="report q3.pdf"',
			}),
		).toBe("report q3.pdf");
		expect(nameFromAttributes({ name: "" })).toBeNull();
		expect(nameFromAttributes({})).toBeNull();
	});
});

describe("fileNameFromContentDisposition", () => {
	it("reads quoted, plain and RFC 5987 file names", () => {
		expect(
			fileNameFromContentDisposition('inline; filename="a \\"b\\".txt"'),
		).toBe('a "b".txt');
		expect(
			fileNameFromContentDisposition("attachment; filename=notes.md"),
		).toBe("notes.md");
		expect(
			fileNameFromContentDisposition(
				"attachment; filename=\"fallback.txt\"; filename*=UTF-8''na%C3%AFve%20file.txt",
			),
		).toBe("naïve file.txt");
	});

	it("falls back to the plain name when the encoded one is malformed", () => {
		expect(
			fileNameFromContentDisposition(
				"attachment; filename*=UTF-8''bad%E0%A4%A; filename=ok.txt",
			),
		).toBe("ok.txt");
	});

	it("returns null without a file name", () => {
		expect(fileNameFromContentDisposition("inline")).toBeNull();
		expect(
			fileNameFromContentDisposition('attachment; filename=""'),
		).toBeNull();
	});
});
