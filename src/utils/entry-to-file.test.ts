import type { Entry, PublicationId, Revision } from "@arcadiasystems/morse-sdk";
import { describe, expect, it } from "vitest";
import { entryToFile } from "./entry-to-file.js";

const pubId = "0xpub" as unknown as PublicationId;

function revision(over: Record<string, unknown>): Revision {
	return {
		id: 0,
		blobRef: { kind: "blob", blobObjectId: "0xblob" },
		contentType: "text/plain",
		encrypted: false,
		accessPolicy: 0,
		sealId: null,
		author: "0xauthor",
		...over,
	} as unknown as Revision;
}

function entry(over: Record<string, unknown>): Entry {
	return {
		id: 1,
		name: "report.pdf",
		revisions: [revision({ id: 0 })],
		draftHead: null,
		publicHead: 0,
		...over,
	} as unknown as Entry;
}

describe("entryToFile", () => {
	it("uses the public head revision", () => {
		const file = entryToFile(
			pubId,
			"files",
			entry({
				revisions: [revision({ id: 0 }), revision({ id: 1 })],
				publicHead: 0,
			}),
		);
		expect(file?.revisionId).toBe(0);
		expect(file?.name).toBe("report.pdf");
		expect(file?.blobObjectId).toBe("0xblob");
	});

	it("falls back to the latest revision when no public head", () => {
		const file = entryToFile(
			pubId,
			"files",
			entry({
				revisions: [revision({ id: 0 }), revision({ id: 1 })],
				publicHead: null,
			}),
		);
		expect(file?.revisionId).toBe(1);
	});

	it("returns null for an entry with no revisions", () => {
		expect(
			entryToFile(pubId, "files", entry({ revisions: [], publicHead: null })),
		).toBeNull();
	});

	it("omits blobObjectId for a quilt-backed revision", () => {
		const file = entryToFile(
			pubId,
			"files",
			entry({
				revisions: [
					revision({ id: 0, blobRef: { kind: "quilt", patchId: "patch" } }),
				],
				publicHead: 0,
			}),
		);
		expect(file?.blobObjectId).toBeUndefined();
		expect(file?.blobRef.kind).toBe("quilt");
	});
});
