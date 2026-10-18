import { describe, expect, it } from "vitest";
import { graphqlData } from "@/network/sui-graphql";
import { parseEventsPage } from "./recipient-file-events";

const CREATED =
	"0x3bb8773c55b5bfde6c3821da52afd038a52e6a6ac586d5106013144f3aa7747f::recipient_file::RecipientFileCreated";

describe("parseEventsPage", () => {
	it("reads RecipientFile events as Sui GraphQL returns them", () => {
		// The test wallet's events on Testnet, 2026-10-18 (trimmed).
		const data = {
			events: {
				pageInfo: { hasPreviousPage: true, startCursor: "KAJCBggAEAAYAA==" },
				nodes: [
					{
						timestamp: "2026-10-18T11:32:50.434Z",
						contents: {
							type: { repr: CREATED },
							json: {
								file: "0x480d599a00000000000000000000000000000000000000000000000000003098e",
								owner:
									"0x4ea7c836fe1c4ac1a40a54a41622e1e60bd7dcc22188ba1e50a7c469b9ae4c75",
								name: "sealed-note.txt",
								content_type: "text/plain",
								size: "46",
								members: [
									"0x4ea7c836fe1c4ac1a40a54a41622e1e60bd7dcc22188ba1e50a7c469b9ae4c75",
								],
							},
						},
					},
					{ timestamp: "2026-10-18T11:33:00Z", contents: { json: {} } },
					{ contents: { type: { repr: CREATED }, json: { file: "0x1" } } },
				],
			},
		};
		const page = parseEventsPage(data);
		expect(page.hasPreviousPage).toBe(true);
		expect(page.startCursor).toBe("KAJCBggAEAAYAA==");
		expect(page.nodes).toEqual([
			{
				type: CREATED,
				json: data.events.nodes[0]?.contents.json,
				timestampMs: Date.parse("2026-10-18T11:32:50.434Z"),
			},
		]);
	});

	it("rejects a body without an events page", () => {
		expect(() => parseEventsPage({})).toThrow(/no events page/);
		expect(() => parseEventsPage(null)).toThrow(/no events page/);
	});
});

describe("graphqlData", () => {
	it("returns the data, and surfaces GraphQL errors and empty bodies", () => {
		expect(graphqlData({ data: { events: null } })).toEqual({ events: null });
		expect(() =>
			graphqlData({ errors: [{ message: "Page size is too large" }] }),
		).toThrow(/Page size is too large/);
		expect(() => graphqlData({})).toThrow(/no data/);
		expect(() => graphqlData(null)).toThrow(/no data/);
	});
});
