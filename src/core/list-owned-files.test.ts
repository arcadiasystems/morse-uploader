import type {
	Entry,
	PublicationId,
	PublicationReader,
	SuiAddress,
} from "@arcadiasystems/morse-sdk";
import { describe, expect, it, vi } from "vitest";
import { listOwnedFiles } from "./list-owned-files.js";

const address = "0xowner" as unknown as SuiAddress;
const pubA = "0xpubA" as unknown as PublicationId;

function oneEntry(): Entry {
	return {
		id: 1,
		name: "f1",
		revisions: [
			{
				id: 0,
				blobRef: { kind: "blob", blobObjectId: "0xb" },
				contentType: "text/plain",
				encrypted: false,
				accessPolicy: 0,
				sealId: null,
				author: "0xa",
			},
		],
		draftHead: null,
		publicHead: 0,
	} as unknown as Entry;
}

function scan() {
	return (async function* () {
		yield oneEntry();
	})();
}

describe("listOwnedFiles", () => {
	it("walks owned publications, their collections, and entries", async () => {
		const reader = {
			listPublicationsOwnedBy: vi.fn().mockResolvedValue({
				results: [{ ownerCapId: "0xc", publicationId: pubA }],
				nextCursor: null,
			}),
			getPublication: vi.fn().mockResolvedValue({
				collections: [{ name: "files" }, { name: "images" }],
			}),
			scanEntries: () => scan(),
		} as unknown as PublicationReader;

		const files = await listOwnedFiles(reader, address);
		// Two collections, one entry each.
		expect(files).toHaveLength(2);
		expect(reader.getPublication).toHaveBeenCalledWith(pubA, undefined);
	});

	it("pages through owned publications until the cursor is exhausted", async () => {
		const listPublicationsOwnedBy = vi
			.fn()
			.mockResolvedValueOnce({
				results: [{ ownerCapId: "0xc", publicationId: pubA }],
				nextCursor: "c1",
			})
			.mockResolvedValueOnce({ results: [], nextCursor: null });
		const reader = {
			listPublicationsOwnedBy,
			getPublication: vi
				.fn()
				.mockResolvedValue({ collections: [{ name: "files" }] }),
			scanEntries: () => scan(),
		} as unknown as PublicationReader;

		await listOwnedFiles(reader, address);
		expect(listPublicationsOwnedBy).toHaveBeenCalledTimes(2);
	});

	it("forwards the abort signal to the reader", async () => {
		const listPublicationsOwnedBy = vi
			.fn()
			.mockResolvedValue({ results: [], nextCursor: null });
		const reader = { listPublicationsOwnedBy } as unknown as PublicationReader;
		const { signal } = new AbortController();
		await listOwnedFiles(reader, address, signal);
		expect(listPublicationsOwnedBy).toHaveBeenCalledWith(
			address,
			expect.objectContaining({ signal }),
		);
	});
});
