import { describe, expect, it } from "vitest";
import { choiceLabel, type PublishChoice } from "./publish-rules";

const choice = (
	publicationId: string,
	publicationName: string,
): PublishChoice => ({
	publicationId,
	publicationName,
	publisherCapId: "0xcap",
	collectionName: "posts",
	storageMode: "blob",
});

describe("choiceLabel", () => {
	it("names the publication and collection", () => {
		const only = choice("0x1111aaaa", "Claude Testnet Run");
		expect(choiceLabel(only, [only])).toBe("Claude Testnet Run · posts");
	});

	it("tells apart two publications with the same name by their ids", () => {
		const a = choice(`0x${"a".repeat(64)}`, "The Morse Demo Blog");
		const b = choice(`0x${"b".repeat(64)}`, "The Morse Demo Blog");
		expect(choiceLabel(a, [a, b])).toBe(
			"The Morse Demo Blog (0xaaaa…aaaa) · posts",
		);
		expect(choiceLabel(b, [a, b])).toBe(
			"The Morse Demo Blog (0xbbbb…bbbb) · posts",
		);
	});
});
