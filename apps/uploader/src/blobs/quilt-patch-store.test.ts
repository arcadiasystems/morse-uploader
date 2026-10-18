import { describe, expect, it, vi } from "vitest";
import {
	createQuiltPatchStore,
	type QuiltIndex,
	UNREAD_PATCHES,
} from "./quilt-patch-store";

/** A promise the test settles by hand. */
function deferred<T>() {
	let resolve: (value: T) => void = () => {};
	let reject: (error: unknown) => void = () => {};
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function quiltIndex(identifiers: string[]): QuiltIndex {
	return {
		patchCount: identifiers.length,
		readIdentifiers: vi.fn(async () => identifiers),
	};
}

describe("createQuiltPatchStore", () => {
	it("reads a quilt's index once and shares it with the identifiers", async () => {
		const index = quiltIndex(["first", "second"]);
		const readIndex = vi.fn(async () => index);
		const store = createQuiltPatchStore(readIndex);
		const listener = vi.fn();
		store.subscribe(listener);

		store.readCount("quilt-a");
		store.readCount("quilt-a");
		expect(store.getSnapshot().get("quilt-a")?.count).toEqual({
			status: "loading",
		});
		await settle();
		expect(store.getSnapshot().get("quilt-a")?.count).toEqual({
			status: "ready",
			data: 2,
		});

		store.readIdentifiers("quilt-a");
		await settle();
		expect(store.getSnapshot().get("quilt-a")?.identifiers).toEqual({
			status: "ready",
			data: ["first", "second"],
		});
		expect(readIndex).toHaveBeenCalledTimes(1);
		expect(index.readIdentifiers).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalled();
	});

	it("keeps a new snapshot per change and leaves other quilts unread", async () => {
		const store = createQuiltPatchStore(async () => quiltIndex(["a"]));
		const before = store.getSnapshot();
		store.readCount("quilt-a");
		expect(store.getSnapshot()).not.toBe(before);
		expect(store.getSnapshot().get("quilt-b") ?? UNREAD_PATCHES).toBe(
			UNREAD_PATCHES,
		);
	});

	it("reports a failed read and reads again on retry", async () => {
		const failure = new Error("No storage node answered.");
		const readIndex = vi
			.fn<(blobId: string) => Promise<QuiltIndex>>()
			.mockRejectedValueOnce(failure)
			.mockResolvedValueOnce(quiltIndex(["only"]));
		const store = createQuiltPatchStore(readIndex);

		store.readIdentifiers("quilt-a");
		await settle();
		expect(store.getSnapshot().get("quilt-a")).toEqual({
			count: { status: "error", error: failure },
			identifiers: { status: "error", error: failure },
		});

		store.retry("quilt-a");
		await settle();
		expect(store.getSnapshot().get("quilt-a")).toEqual({
			count: { status: "ready", data: 1 },
			identifiers: { status: "ready", data: ["only"] },
		});
		expect(readIndex).toHaveBeenCalledTimes(2);
	});

	it("reads at most three quilt indexes at once", async () => {
		const pending = new Map<string, ReturnType<typeof deferred<QuiltIndex>>>();
		const store = createQuiltPatchStore((blobId) => {
			const next = deferred<QuiltIndex>();
			pending.set(blobId, next);
			return next.promise;
		});
		for (const id of ["a", "b", "c", "d", "e"]) store.readCount(id);
		await settle();
		expect([...pending.keys()]).toEqual(["a", "b", "c"]);
		pending.get("a")?.resolve(quiltIndex(["x"]));
		await settle();
		expect([...pending.keys()]).toEqual(["a", "b", "c", "d"]);
	});
});
