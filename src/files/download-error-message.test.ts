import { NotFoundError } from "@arcadiasystems/morse-sdk";
import { describe, expect, it } from "vitest";
import { downloadErrorMessage } from "./download-error-message.js";
import { ShareLinkSealError } from "./share-link-seal-error.js";

describe("downloadErrorMessage", () => {
	it("says a link without Seal material is incomplete", () => {
		const error = new ShareLinkSealError("missing");
		const message = downloadErrorMessage(error);
		expect(message.title).toBe("Link is incomplete");
		expect(message.description).toContain("This file is encrypted");
		expect(message.description).toContain("Ask the sender for the full link.");
		expect(message.cause).toBe(error);
	});

	it("says a link with another file's Seal material does not match", () => {
		const message = downloadErrorMessage(new ShareLinkSealError("mismatch"));
		expect(message.title).toBe("Link does not match this file");
		expect(message.description).toContain("for a different file");
		expect(message.description).toContain("Ask the sender for the full link.");
	});

	it("defers everything else to the SDK", () => {
		const message = downloadErrorMessage(
			new NotFoundError("recipient-file", "0xfile"),
		);
		expect(message.title).toBe("File not found");
	});
});
