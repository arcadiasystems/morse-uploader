import type {
	PublicationId,
	PublicationReader,
	SuiAddress,
} from "@arcadiasystems/morse-sdk";
import { describe, expect, it, vi } from "vitest";
import { listUserFiles } from "./list-user-files.js";

const pubId = "0xpub" as unknown as PublicationId;
const address = "0xowner" as unknown as SuiAddress;

describe("listUserFiles", () => {
	it("uses the collection path when publicationId and collectionName are given", async () => {
		const scanEntries = vi.fn(() => (async function* () {})());
		const reader = {
			scanEntries,
			listPublicationsOwnedBy: vi.fn(),
		} as unknown as PublicationReader;

		await listUserFiles(reader, {
			publicationId: pubId,
			collectionName: "files",
		});
		expect(scanEntries).toHaveBeenCalled();
		expect(reader.listPublicationsOwnedBy).not.toHaveBeenCalled();
	});

	it("uses the owned path when only an address is given", async () => {
		const listPublicationsOwnedBy = vi
			.fn()
			.mockResolvedValue({ results: [], nextCursor: null });
		const reader = {
			listPublicationsOwnedBy,
			scanEntries: vi.fn(),
		} as unknown as PublicationReader;

		await listUserFiles(reader, { address });
		expect(listPublicationsOwnedBy).toHaveBeenCalled();
	});

	it("throws when neither a collection scope nor an address is given", () => {
		const reader = {} as unknown as PublicationReader;
		expect(() => listUserFiles(reader, {})).toThrow(/provide either/);
	});
});
