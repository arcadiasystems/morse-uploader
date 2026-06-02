import { describe, expect, it } from "vitest";
import { collectDeletedObjects } from "./collect-deleted-objects.js";

type Changes = Parameters<typeof collectDeletedObjects>[0];

const id1 = `0x${"a".repeat(64)}`;
const id2 = `0x${"b".repeat(64)}`;

describe("collectDeletedObjects", () => {
	it("keeps only Deleted changes", () => {
		const changes = [
			{ idOperation: "Deleted", objectId: id1 },
			{ idOperation: "Created", objectId: id2 },
		] as unknown as Changes;
		expect(collectDeletedObjects(changes)).toHaveLength(1);
	});

	it("returns empty when there are no deletions", () => {
		const changes = [
			{ idOperation: "Created", objectId: id1 },
		] as unknown as Changes;
		expect(collectDeletedObjects(changes)).toEqual([]);
	});
});
