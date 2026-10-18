import { describe, expect, it } from "vitest";
import type { RecipientFileRecord } from "@/morse/read-shared-files";
import { blobRow } from "./fixtures";
import { isShared, publishedObjectIds, sharedObjectIds } from "./morse-marks";

const OWNER =
	"0x4ea7c836fe1c4ac1a40a54a41622e1e60bd7dcc22188ba1e50a7c469b9ae4c75";
const FRIEND =
	"0xba913eaeaa8cdc40ac583d6854f580fc42095fb796e42f240b18597ed3399b4e";
const longId = (tail: string) => `0x${tail.padStart(64, "0")}`;

function file(overrides: Partial<RecipientFileRecord>): RecipientFileRecord {
	return {
		fileId: longId("f1e"),
		name: "sealed-note.txt",
		owner: OWNER,
		blobObjectId: null,
		blobId: "ZwUNtNTiVu-7D1oLE11YPOh5_l2am8_Gwt_HQ_AvPZ8",
		members: [OWNER],
		...overrides,
	};
}

describe("publishedObjectIds", () => {
	const plain = blobRow({ objectId: longId("abcd") });
	const quilt = blobRow({
		objectId: longId("bead"),
		blobId: "quiltBlobIdAAAA",
		isQuilt: true,
	});
	// A plain blob that happens to share the quilt's blob id string.
	const lookalike = blobRow({
		objectId: longId("cafe"),
		blobId: "quiltBlobIdAAAA",
	});
	const other = blobRow({ objectId: longId("dead") });

	it("matches blob refs by object id, whatever the address spelling", () => {
		const published = publishedObjectIds(
			[plain, other],
			[{ kind: "blob", objectId: "0xABCD" }],
		);
		expect([...published]).toEqual([plain.blob.objectId]);
	});

	it("matches quilt refs by the quilt blob id, on quilts only", () => {
		const published = publishedObjectIds(
			[quilt, lookalike, other],
			[{ kind: "quilt", quiltBlobId: "quiltBlobIdAAAA" }],
		);
		expect([...published]).toEqual([quilt.blob.objectId]);
	});

	it("finds nothing without refs", () => {
		expect(publishedObjectIds([plain, quilt], []).size).toBe(0);
	});
});

describe("isShared", () => {
	it("is shared only when someone besides the owner is a member", () => {
		expect(isShared(file({ members: [OWNER] }))).toBe(false);
		expect(isShared(file({ members: [OWNER, FRIEND] }))).toBe(true);
		expect(isShared(file({ members: [] }))).toBe(false);
	});

	it("compares addresses in full form", () => {
		const shortOwner = file({
			owner: "0x2",
			members: [longId("2"), "0x0002"],
		});
		expect(isShared(shortOwner)).toBe(false);
	});
});

describe("sharedObjectIds", () => {
	const sealed = blobRow({ objectId: longId("5d94"), isEncrypted: true });
	const byBlobId = blobRow({
		objectId: longId("7068"),
		blobId: "eSZfO1tqMcQxRX6v_XKcs3abuw2pw2zbggJuQxdoBMg",
	});
	const other = blobRow({ objectId: longId("9999") });

	it("marks the blob a shared RecipientFile points at by object id", () => {
		const shared = sharedObjectIds(
			[sealed, other],
			[file({ blobObjectId: "0x5d94", members: [OWNER, FRIEND] })],
		);
		expect([...shared]).toEqual([sealed.blob.objectId]);
	});

	it("falls back to the blob id when the file names no object", () => {
		const shared = sharedObjectIds(
			[sealed, byBlobId, other],
			[
				file({
					blobObjectId: null,
					blobId: byBlobId.blob.blobId,
					members: [OWNER, FRIEND],
				}),
			],
		);
		expect([...shared]).toEqual([byBlobId.blob.objectId]);
	});

	it("ignores files only their owner can decrypt", () => {
		const shared = sharedObjectIds(
			[sealed],
			[file({ blobObjectId: sealed.blob.objectId, members: [OWNER] })],
		);
		expect(shared.size).toBe(0);
	});
});
