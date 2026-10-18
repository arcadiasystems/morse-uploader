import { describe, expect, it } from "vitest";
import { parseEventsPage } from "./find-recipient-file";

describe("parseEventsPage", () => {
	it("reads RecipientFileCreated events as Sui GraphQL returns them", () => {
		// The test wallet's events on Testnet, 2026-10-18 (trimmed).
		const body = {
			data: {
				events: {
					pageInfo: { hasPreviousPage: true, startCursor: "KAJCBggAEAAYAA==" },
					nodes: [
						{
							contents: {
								json: {
									file: "0x480d599a00000000000000000000000000000000000000000000000000003098e",
									owner:
										"0x4ea7c836fe1c4ac1a40a54a41622e1e60bd7dcc22188ba1e50a7c469b9ae4c75",
									name: "sealed-note.txt",
									content_type: "text/plain",
									size: "46",
								},
							},
						},
						{ contents: { json: { unexpected: true } } },
					],
				},
			},
		};
		expect(parseEventsPage(body)).toEqual({
			nodes: [
				{
					fileId:
						"0x480d599a00000000000000000000000000000000000000000000000000003098e",
					name: "sealed-note.txt",
				},
			],
			hasPreviousPage: true,
			startCursor: "KAJCBggAEAAYAA==",
		});
	});

	it("surfaces GraphQL errors and unexpected shapes", () => {
		expect(() =>
			parseEventsPage({ errors: [{ message: "Page size is too large" }] }),
		).toThrow(/Page size is too large/);
		expect(() => parseEventsPage({ data: {} })).toThrow(/no events page/);
		expect(() => parseEventsPage(null)).toThrow();
	});
});
