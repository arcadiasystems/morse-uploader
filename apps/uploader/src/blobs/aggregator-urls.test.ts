import { describe, expect, it } from "vitest";
import { NETWORKS } from "@/network/networks";
import { blobByObjectIdUrl } from "./aggregator-urls";

describe("blobByObjectIdUrl", () => {
	it("builds the aggregator's by-object-id route (PROTOCOL-NOTES section 10)", () => {
		expect(
			blobByObjectIdUrl(
				NETWORKS.testnet.aggregatorUrl,
				"0x23ff43fd00000000000000000000000000000000000000000000000000049ec",
			),
		).toBe(
			"https://aggregator.walrus-testnet.walrus.space/v1/blobs/by-object-id/0x23ff43fd00000000000000000000000000000000000000000000000000049ec",
		);
	});
});
