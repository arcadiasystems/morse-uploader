import { describe, expect, it } from "vitest";
import { collectCreatedObjects } from "./collect-created-objects.js";

type Changes = Parameters<typeof collectCreatedObjects>[0];

const id1 = `0x${"a".repeat(64)}`;
const id2 = `0x${"b".repeat(64)}`;
const id3 = `0x${"c".repeat(64)}`;

describe("collectCreatedObjects", () => {
	it("keeps Created changes that have a resolved type", () => {
		const changes = [
			{ idOperation: "Created", objectId: id1 },
			// Created but no type -> skipped.
			{ idOperation: "Created", objectId: id2 },
			// Not a creation -> skipped.
			{ idOperation: "Mutated", objectId: id3 },
		] as unknown as Changes;
		const out = collectCreatedObjects(changes, { [id1]: "0xpkg::m::T" });
		expect(out).toHaveLength(1);
		expect(out[0]?.objectType).toBe("0xpkg::m::T");
	});

	it("returns empty when there are no creations", () => {
		const changes = [
			{ idOperation: "Mutated", objectId: id1 },
		] as unknown as Changes;
		expect(collectCreatedObjects(changes, {})).toEqual([]);
	});
});
