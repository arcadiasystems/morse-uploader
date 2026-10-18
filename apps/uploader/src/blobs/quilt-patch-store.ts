import { createLimiter } from "@/lib/create-limiter";

export type Phase<T> =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ready"; data: T }
	| { status: "error"; error: unknown };

/** A quilt's index as read from storage nodes. */
export interface QuiltIndex {
	patchCount: number;
	/** Reads every patch's identifier, in index order. */
	readIdentifiers: () => Promise<readonly string[]>;
}

export type ReadQuiltIndex = (blobId: string) => Promise<QuiltIndex>;

/** What is known about one quilt's patches. */
export interface QuiltPatches {
	count: Phase<number>;
	identifiers: Phase<readonly string[]>;
}

export interface QuiltPatchStore {
	subscribe: (listener: () => void) => () => void;
	/** Patches by quilt blob id; a new map on every change. */
	getSnapshot: () => ReadonlyMap<string, QuiltPatches>;
	/** Reads the quilt's patch count once; later calls do nothing. */
	readCount: (blobId: string) => void;
	/** Reads the patch identifiers once, after the count. */
	readIdentifiers: (blobId: string) => void;
	/** Reads again whatever failed for this quilt. */
	retry: (blobId: string) => void;
}

const IDLE = { status: "idle" } as const;

export const UNREAD_PATCHES: QuiltPatches = { count: IDLE, identifiers: IDLE };

/** Quilt index reads in flight at once; each can fan out to many storage nodes. */
const INDEX_READS_AT_ONCE = 3;

/**
 * Patch counts and identifiers for the quilts in the list, for
 * useSyncExternalStore. A blob id names immutable bytes, so a successful read
 * is kept for the session and never repeated; a failed one can be retried.
 */
export function createQuiltPatchStore(
	readIndex: ReadQuiltIndex,
): QuiltPatchStore {
	const limit = createLimiter(INDEX_READS_AT_ONCE);
	const indexes = new Map<string, Promise<QuiltIndex>>();
	const listeners = new Set<() => void>();
	let snapshot: ReadonlyMap<string, QuiltPatches> = new Map();

	function patchesOf(blobId: string): QuiltPatches {
		return snapshot.get(blobId) ?? UNREAD_PATCHES;
	}

	function update(blobId: string, change: Partial<QuiltPatches>): void {
		const next = new Map(snapshot);
		next.set(blobId, { ...patchesOf(blobId), ...change });
		snapshot = next;
		for (const listener of listeners) listener();
	}

	/** The quilt's index, read once and shared between the count and the identifiers. */
	function index(blobId: string): Promise<QuiltIndex> {
		const known = indexes.get(blobId);
		if (known) return known;
		const pending = limit(() => readIndex(blobId));
		indexes.set(blobId, pending);
		// Forget a failed read so a retry reads again; callers report the error.
		pending.then(undefined, () => indexes.delete(blobId));
		return pending;
	}

	function readCount(blobId: string): void {
		if (patchesOf(blobId).count.status !== "idle") return;
		update(blobId, { count: { status: "loading" } });
		index(blobId).then(
			(quilt) =>
				update(blobId, { count: { status: "ready", data: quilt.patchCount } }),
			(error: unknown) => update(blobId, { count: { status: "error", error } }),
		);
	}

	function readIdentifiers(blobId: string): void {
		if (patchesOf(blobId).identifiers.status !== "idle") return;
		readCount(blobId);
		update(blobId, { identifiers: { status: "loading" } });
		index(blobId)
			.then((quilt) => quilt.readIdentifiers())
			.then(
				(identifiers) =>
					update(blobId, {
						identifiers: { status: "ready", data: identifiers },
					}),
				(error: unknown) =>
					update(blobId, { identifiers: { status: "error", error } }),
			);
	}

	return {
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getSnapshot: () => snapshot,
		readCount,
		readIdentifiers,
		retry(blobId) {
			const { count, identifiers } = patchesOf(blobId);
			update(blobId, {
				count: count.status === "error" ? IDLE : count,
				identifiers: identifiers.status === "error" ? IDLE : identifiers,
			});
			readCount(blobId);
			if (identifiers.status === "error") readIdentifiers(blobId);
		},
	};
}
