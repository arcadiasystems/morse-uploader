import type { ObjectReader } from "@arcadiasystems/morse-sdk";
import { describe, expect, it, vi } from "vitest";
import { resolveObjectTypes } from "./resolve-object-types.js";

function makeReader(getObject: ReturnType<typeof vi.fn>): ObjectReader {
	return { getObject } as unknown as ObjectReader;
}

describe("resolveObjectTypes", () => {
	it("returns an id -> type map for resolvable ids", async () => {
		const getObject = vi.fn(async ({ objectId }: { objectId: string }) => ({
			object: { objectId, type: `T:${objectId}` },
		}));
		const map = await resolveObjectTypes(makeReader(getObject), ["0xa", "0xb"]);
		expect(map).toEqual({ "0xa": "T:0xa", "0xb": "T:0xb" });
	});

	it("skips ids that fail to resolve", async () => {
		const getObject = vi.fn(async ({ objectId }: { objectId: string }) => {
			if (objectId === "0xbad") {
				throw new Error("not found");
			}
			return { object: { objectId, type: "T" } };
		});
		const map = await resolveObjectTypes(makeReader(getObject), [
			"0xgood",
			"0xbad",
		]);
		expect(map).toEqual({ "0xgood": "T" });
	});
});
