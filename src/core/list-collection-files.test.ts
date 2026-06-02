import type {
	Entry,
	PublicationId,
	PublicationReader,
} from "@arcadiasystems/morse-sdk";
import { describe, expect, it, vi } from "vitest";
import { listCollectionFiles } from "./list-collection-files.js";

const pubId = "0xpub" as unknown as PublicationId;

function entry(id: number, withRevision: boolean): Entry {
	return {
		id,
		name: `f${id}`,
		revisions: withRevision
			? [
					{
						id: 0,
						blobRef: { kind: "blob", blobObjectId: "0xb" },
						contentType: "text/plain",
						encrypted: false,
						accessPolicy: 0,
						sealId: null,
						author: "0xa",
					},
				]
			: [],
		draftHead: null,
		publicHead: withRevision ? 0 : null,
	} as unknown as Entry;
}

function readerWith(entries: Entry[]): PublicationReader {
	return {
		scanEntries: () =>
			(async function* () {
				for (const e of entries) {
					yield e;
				}
			})(),
	} as unknown as PublicationReader;
}

describe("listCollectionFiles", () => {
	it("maps scanned entries to files, skipping those with no revision", async () => {
		const reader = readerWith([
			entry(1, true),
			entry(2, false),
			entry(3, true),
		]);
		const files = await listCollectionFiles(reader, pubId, "files");
		expect(files.map((f) => f.entryId)).toEqual([1, 3]);
	});

	it("forwards the abort signal to scanEntries", async () => {
		const scanEntries = vi.fn(() => (async function* () {})());
		const reader = { scanEntries } as unknown as PublicationReader;
		const { signal } = new AbortController();
		await listCollectionFiles(reader, pubId, "files", signal);
		expect(scanEntries).toHaveBeenCalledWith(pubId, "files", { signal });
	});
});
