import { ObjectError } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import {
	ConnectionTimeoutError,
	encodeQuilt,
	type WalrusClient,
	type WriteBlobFlow,
} from "@mysten/walrus";
import type { BlobRecord } from "@/blobs/blob-record";
import { readEpochClock } from "@/blobs/epoch-clock";
import { parseBlob } from "@/blobs/parse-blob";
import { errorMessage } from "@/lib/error-message";
import { shortenAddress } from "@/lib/shorten-address";
import {
	confirmRecord,
	type RecordTarget,
	RecordUnconfirmedError,
	recordToMorse,
} from "@/morse/record-to-morse";
import { sealFile } from "@/morse/seal-encryption";
import type { NetworkClient } from "@/network/create-network-client";
import { NETWORKS, type NetworkId } from "@/network/networks";
import { MAX_CERTIFIES_PER_TRANSACTION } from "@/upload/upload-cost";
import { blobAttributes } from "@/upload/upload-plan";
import { createWriteClient } from "./create-write-client";
import { createProgressFetch } from "./progress-fetch";
import {
	type EntryPlan,
	type RecordPlan,
	recordPlanFor,
	recordTransactions,
	type TransferRecord,
} from "./record-plan";
import { retriesAutomatically, retryDelayMs } from "./retry-policy";
import type { SavedUpload, SavedUploadStore } from "./saved-uploads";
import type { TransferBatch, TransferJob } from "./transfer-job";
import {
	certifyGroup,
	INITIAL_TRANSFER_STATE,
	nextQueued,
	type TransferEvent,
	type TransferItem,
	type TransferState,
	type TransferStep,
	transferReducer,
} from "./transfer-state";
import {
	createWalletExecutor,
	type ExecutedTransaction,
	type SignWithWallet,
	TransactionFailedError,
	TransactionUnconfirmedError,
	type WalletExecutor,
	WalletPopupBlockedError,
	WalletRejectedError,
} from "./wallet-executor";

export interface TransferQueueDeps {
	client: (network: NetworkId) => NetworkClient;
	/** Signs with the wallet for `owner` on `network`; `null` when it is not connected. */
	signer: (network: NetworkId, owner: string) => SignWithWallet | null;
	savedUploads: SavedUploadStore;
	/** An item reached done: the Walrus pane and balances re-read. */
	onDone: (item: TransferItem) => void;
	now: () => number;
}

/** A transaction that was sent but not confirmed, checked before signing again. */
type Pending =
	| { step: "register" | "certify"; digest: string }
	| { step: "record"; digest: string; target: RecordTarget };

/** What the queue holds for an item beyond its display state. */
interface ItemWork {
	/** `null` for an item restored after a reload: only Finish and record can run. */
	job: TransferJob | null;
	/** Held from encode to upload only: the flow keeps the whole blob in memory. */
	writer: WalrusClient | null;
	flow: WriteBlobFlow | null;
	record: RecordPlan;
	saved: SavedUpload | null;
	pending: Pending | null;
	/** Attempts of the current step, for automatic retries. */
	attempts: number;
}

/** Progress updates are coalesced to this interval. */
const PROGRESS_INTERVAL_MS = 150;

/**
 * Runs uploads one item at a time, so wallet requests come one after the
 * other, and certifies each batch in one transaction once its items are on
 * the storage nodes. State changes go through `transferReducer`; React
 * reads them with `useSyncExternalStore`.
 */
export class TransferQueue {
	#state: TransferState = INITIAL_TRANSFER_STATE;
	readonly #listeners = new Set<() => void>();
	readonly #work = new Map<string, ItemWork>();
	readonly #retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
	readonly #deps: TransferQueueDeps;
	#busy = false;

	constructor(deps: TransferQueueDeps) {
		this.#deps = deps;
	}

	getState = (): TransferState => this.#state;

	subscribe = (listener: () => void): (() => void) => {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	};

	enqueue({ network, owner, jobs }: TransferBatch): void {
		const batchId = crypto.randomUUID();
		const items = jobs.map((job): TransferItem => {
			const id = crypto.randomUUID();
			const record = recordPlanFor(job.plan, job.publish);
			this.#work.set(id, {
				job,
				writer: null,
				flow: null,
				record,
				saved: null,
				pending: null,
				attempts: 0,
			});
			const records = recordTransactions(record);
			return {
				id,
				batchId,
				network,
				owner,
				name: job.plan.name,
				kind: job.plan.kind,
				fileCount: job.plan.kind === "quilt" ? job.plan.patches.length : 1,
				uploadBytes: job.plan.uploadBytes,
				encrypted: job.plan.kind === "blob" && job.plan.seal !== null,
				estimate: job.estimate,
				steps: [
					"encode",
					"register",
					"upload",
					"certify",
					...(records > 0 ? (["record"] as const) : []),
				],
				transactions: 2 + records,
				signed: 0,
				status: { kind: "queued", from: "encode" },
				blobId: null,
				blobObjectId: null,
				registerDigest: null,
				certifyDigest: null,
				records: [],
				startedAtMs: null,
				finishedAtMs: null,
			};
		});
		this.#dispatch({ type: "enqueued", items });
	}

	/** Runs a failed step again (Retry, Finish or Sign), or a waiting retry now. */
	retry(id: string): void {
		const item = this.#item(id);
		if (!item) return;
		const { status } = item;
		if (status.kind === "retrying") {
			this.#clearRetryTimer(id);
			this.#dispatch({ type: "requeued", id, from: status.step });
		} else if (status.kind === "failed" && status.retryable) {
			const work = this.#work.get(id);
			if (work) work.attempts = 0;
			this.#dispatch({ type: "requeued", id, from: status.step });
		}
	}

	/** Removes a stopped item from the queue and forgets its saved upload. */
	dismiss(id: string): void {
		if (this.#item(id)?.status.kind !== "failed") return;
		this.#clearRetryTimer(id);
		this.#work.delete(id);
		this.#dispatch({ type: "dismissed", id });
		// #forget reports its own failure as a queue notice; it never rejects.
		void this.#forget(id);
	}

	pause(): void {
		this.#dispatch({ type: "paused" });
	}

	resume(): void {
		this.#dispatch({ type: "resumed" });
	}

	/**
	 * Brings back the uploads saved for this wallet and network that never
	 * finished: certified ones that still have Morse transactions to make,
	 * and uncertified ones, which Finish certifies. Uploads whose blob is
	 * gone, or whose storage ended before it was certified, are forgotten.
	 */
	async restore(network: NetworkId, owner: string): Promise<void> {
		if (!(await this.#deps.savedUploads.durable()))
			this.#dispatch({
				type: "noticed",
				notice:
					"This browser does not keep data for this site, so an upload that stops can only be finished before the tab closes.",
			});
		const saved = await this.#deps.savedUploads.list(network, owner);
		if (saved.length === 0) return;
		const client = this.#deps.client(network);
		const { epoch } = await readEpochClock(client);
		const restored: TransferItem[] = [];
		for (const upload of saved) {
			if (this.#work.has(upload.item.id)) continue;
			const blob = await readBlob(client, upload.item.blobObjectId);
			const certified = blob?.certifiedEpoch != null;
			const recordsLeft =
				recordTransactions(upload.record) > upload.item.records.length;
			const finishable = blob !== null && !certified && blob.endEpoch > epoch;
			if (!finishable && !(certified && recordsLeft)) {
				await this.#deps.savedUploads.remove(upload.item.id);
				continue;
			}
			this.#work.set(upload.item.id, {
				job: null,
				writer: null,
				flow: null,
				record: upload.record,
				saved: upload,
				pending: null,
				attempts: 0,
			});
			restored.push({
				...upload.item,
				status: certified
					? {
							kind: "failed",
							step: "record",
							error: "The Morse step did not finish before the page closed.",
							finishable: false,
							retryable: true,
							needsClick: false,
						}
					: {
							kind: "failed",
							step: "certify",
							error: "The upload stopped before it was certified.",
							finishable: true,
							retryable: true,
							needsClick: false,
						},
			});
		}
		this.#dispatch({ type: "restored", items: restored });
	}

	#dispatch(event: TransferEvent): void {
		this.#state = transferReducer(this.#state, event);
		for (const listener of this.#listeners) listener();
		queueMicrotask(() => this.#pump());
	}

	#item(id: string): TransferItem | undefined {
		return this.#state.items.find((item) => item.id === id);
	}

	#clearRetryTimer(id: string): void {
		const timer = this.#retryTimers.get(id);
		if (timer !== undefined) clearTimeout(timer);
		this.#retryTimers.delete(id);
	}

	/** Starts the next piece of work when nothing is running and the queue is not paused. */
	#pump(): void {
		if (this.#busy || this.#state.paused) return;
		const group = certifyGroup(this.#state).slice(
			0,
			MAX_CERTIFIES_PER_TRANSACTION,
		);
		const next = group.length > 0 ? null : nextQueued(this.#state);
		if (group.length === 0 && !next) return;
		this.#busy = true;
		const task =
			group.length > 0
				? this.#certify(group)
				: next
					? this.#run(next)
					: Promise.resolve();
		task.finally(() => {
			this.#busy = false;
			this.#pump();
		});
	}

	async #run(item: TransferItem): Promise<void> {
		if (item.status.kind !== "queued") return;
		const { from } = item.status;
		if (from === "certify") return this.#certify([item]);
		if (from === "record") return this.#record(item);
		const order: TransferStep[] = ["encode", "register", "upload"];
		const steps = order.slice(order.indexOf(from));
		for (const [index, step] of steps.entries()) {
			// Pause all stops between steps, so no new wallet request appears.
			if (index > 0 && this.#state.paused) {
				this.#dispatch({ type: "requeued", id: item.id, from: step });
				return;
			}
			const ok = await this.#runStep(item.id, step);
			if (!ok) return;
		}
	}

	/** Runs one upload step; `false` when it failed and the item stops here. */
	async #runStep(id: string, step: TransferStep): Promise<boolean> {
		this.#dispatch({ type: "started", id, step, atMs: this.#deps.now() });
		try {
			if (step === "encode") await this.#encode(id);
			else if (step === "register") await this.#register(id);
			else await this.#upload(id);
		} catch (error) {
			this.#fail(id, step, error);
			return false;
		}
		const work = this.#work.get(id);
		if (work) work.attempts = 0;
		return true;
	}

	#fail(id: string, step: TransferStep, error: unknown): void {
		const work = this.#work.get(id);
		const message = describeError(error);
		const attempt = (work?.attempts ?? 0) + 1;
		if (work) work.attempts = attempt;
		if (retriesAutomatically(step, attempt)) {
			const delay = retryDelayMs(attempt + 1);
			this.#dispatch({
				type: "retry-scheduled",
				id,
				step,
				attempt: attempt + 1,
				retryAtMs: this.#deps.now() + delay,
				error: message,
			});
			this.#retryTimers.set(
				id,
				setTimeout(() => {
					this.#retryTimers.delete(id);
					this.#dispatch({ type: "requeued", id, from: step });
				}, delay),
			);
			return;
		}
		this.#dispatch({
			type: "failed",
			id,
			step,
			error: message,
			finishable: step === "certify",
			retryable: canRetry(step, work),
			needsClick: error instanceof WalletPopupBlockedError,
		});
	}

	#executor(item: TransferItem): WalletExecutor {
		const sign = this.#deps.signer(item.network, item.owner);
		if (!sign)
			throw new Error(
				`Connect the wallet for ${shortenAddress(item.owner)} on ${NETWORKS[item.network].label}, then press Retry.`,
			);
		return createWalletExecutor(
			item.owner,
			sign,
			this.#deps.client(item.network),
		);
	}

	async #encode(id: string): Promise<void> {
		const item = this.#require(id);
		const work = this.#requireWork(id);
		const job = work.job;
		if (!job) throw new Error("The files for this upload are no longer open.");
		let lastReport = 0;
		let firstSentAt: number | null = null;
		const writer = createWriteClient({
			network: item.network,
			tipMaxMist: job.tipMaxMist,
			fetch: createProgressFetch((sent) => {
				const now = this.#deps.now();
				// Speed counts from the first byte sent, not from encoding or signing.
				firstSentAt ??= now;
				if (now - lastReport < PROGRESS_INTERVAL_MS && sent < item.uploadBytes)
					return;
				lastReport = now;
				const seconds = (now - firstSentAt) / 1000;
				this.#dispatch({
					type: "progressed",
					id,
					sentBytes: sent,
					bytesPerSecond: seconds > 0 ? sent / seconds : null,
				});
			}),
		});
		const blob = await this.#bytesFor(item, job, writer, work);
		const flow = writer.writeBlobFlow({ blob });
		const encoded = await flow.encode();
		work.writer = writer;
		work.flow = flow;
		this.#dispatch({ type: "encoded", id, blobId: encoded.blobId });
	}

	/** The bytes the relay receives: the file, its Seal ciphertext, or the quilt. */
	async #bytesFor(
		item: TransferItem,
		job: TransferJob,
		writer: WalrusClient,
		work: ItemWork,
	): Promise<Uint8Array> {
		const { plan } = job;
		if (plan.kind === "blob") {
			const plaintext = new Uint8Array(await plan.file.file.arrayBuffer());
			if (!plan.seal) return plaintext;
			const sealed = await sealFile(
				this.#deps.client(item.network),
				item.network,
				plaintext,
			);
			const { recipientFile } = work.record;
			if (recipientFile)
				work.record = {
					...work.record,
					recipientFile: {
						...recipientFile,
						sealIdPrefixHex: sealed.sealIdPrefixHex,
					},
				};
			return sealed.ciphertext;
		}
		const { committee } = await writer.systemState();
		const { quilt, index } = encodeQuilt({
			numShards: committee.n_shards,
			blobs: await Promise.all(
				plan.patches.map(async (patch) => ({
					identifier: patch.identifier,
					tags: { ...patch.tags },
					contents: new Uint8Array(await patch.file.file.arrayBuffer()),
				})),
			),
		});
		if (work.record.publish) {
			const columns = new Map(
				index.patches.map((patch) => [patch.identifier, patch]),
			);
			work.record = {
				...work.record,
				publish: {
					...work.record.publish,
					entries: work.record.publish.entries.map((entry): EntryPlan => {
						const placed = columns.get(entry.name);
						if (!placed)
							throw new Error(
								`${entry.name} is missing from the encoded quilt.`,
							);
						return {
							...entry,
							patch: {
								startIndex: placed.startIndex,
								endIndex: placed.endIndex,
							},
						};
					}),
				},
			};
		}
		return quilt;
	}

	async #register(id: string): Promise<void> {
		const item = this.#require(id);
		const work = this.#requireWork(id);
		const { job, flow, writer } = work;
		if (!job || !flow || !writer)
			throw new Error("This upload must be encoded again first.");
		const executor = this.#executor(item);
		let executed: ExecutedTransaction;
		if (work.pending?.step === "register") {
			// The last register was sent but not confirmed: read it, never sign twice.
			executed = await executor.confirm(work.pending.digest);
		} else {
			// Current prices: a price vote since the last build would abort the
			// exact-amount WAL coin (PROTOCOL-NOTES section 4).
			writer.reset();
			const transaction = flow.register({
				epochs: job.epochs,
				deletable: job.deletable,
				owner: item.owner,
				attributes: blobAttributes(job.plan),
			});
			executed = await this.#signOnce(work, "register", () =>
				executor.execute(transaction),
			);
		}
		work.pending = null;
		const blobType = await writer.getBlobType();
		const blobObjectId = executed.effects.changedObjects.find(
			(change) =>
				change.idOperation === "Created" &&
				executed.objectTypes[change.objectId] === blobType,
		)?.objectId;
		if (!blobObjectId)
			throw new Error(
				`The register transaction ${executed.digest} created no Blob object.`,
			);
		this.#dispatch({
			type: "registered",
			id,
			blobObjectId,
			digest: executed.digest,
		});
	}

	async #upload(id: string): Promise<void> {
		const item = this.#require(id);
		const work = this.#requireWork(id);
		const { job, flow, writer } = work;
		if (!job || !flow || !writer || !item.registerDigest)
			throw new Error("This upload must be registered first.");
		const uploaded = await flow.upload({ digest: item.registerDigest });
		const { committee } = await writer.systemState();
		const saved: SavedUpload = {
			item: { ...this.#require(id), status: { kind: "awaiting-certify" } },
			deletable: job.deletable,
			certificate: uploaded.certificate,
			certificateEpoch: committee.epoch,
			record: work.record,
		};
		work.saved = saved;
		// The bytes are on the storage nodes; the flow need not hold them any more.
		work.flow = null;
		work.writer = null;
		this.#dispatch({ type: "uploaded", id });
		await this.#save(saved);
	}

	/**
	 * Certifies items in one transaction (PROTOCOL-NOTES section 6). A
	 * certificate is only valid in the epoch it was issued in; after an epoch
	 * change the storage confirmations are collected again from the nodes.
	 * Items found already certified on chain are not certified again. A
	 * failure leaves every item finishable from its saved state.
	 */
	async #certify(items: readonly TransferItem[]): Promise<void> {
		const [first] = items;
		if (!first) return;
		const now = this.#deps.now();
		for (const item of items)
			this.#dispatch({
				type: "started",
				id: item.id,
				step: "certify",
				atMs: now,
			});
		const ids = items.map((item) => item.id);
		try {
			const client = this.#deps.client(first.network);
			const executor = this.#executor(first);
			const pending = this.#requireWork(first.id).pending;
			if (pending?.step === "certify") {
				const executed = await executor.confirm(pending.digest);
				this.#certified(ids, executed.digest);
			} else {
				const open: TransferItem[] = [];
				for (const item of items) {
					const blob = await readBlob(client, item.blobObjectId);
					if (blob?.certifiedEpoch != null) this.#certified([item.id], null);
					else open.push(item);
				}
				if (open.length > 0) {
					const transaction = await this.#certifyTransaction(client, open);
					const executed = await this.#signOnce(
						open.map((item) => this.#requireWork(item.id)),
						"certify",
						() => executor.execute(transaction),
					);
					this.#certified(
						open.map((item) => item.id),
						executed.digest,
					);
				}
			}
		} catch (error) {
			for (const id of ids)
				if (this.#item(id)?.status.kind === "running")
					this.#fail(id, "certify", error);
			return;
		}
		for (const id of ids) await this.#afterStep(id);
	}

	async #certifyTransaction(
		client: NetworkClient,
		items: readonly TransferItem[],
	): Promise<Transaction> {
		client.walrus.reset();
		const { committee } = await client.walrus.systemState();
		const transaction = new Transaction();
		for (const item of items) {
			const saved = this.#requireWork(item.id).saved;
			if (!saved || !item.blobId || !item.blobObjectId)
				throw new Error(`${item.name} has no saved upload to certify.`);
			const common = {
				transaction,
				blobId: item.blobId,
				blobObjectId: item.blobObjectId,
				deletable: saved.deletable,
			};
			if (saved.certificateEpoch === committee.epoch)
				client.walrus.certifyBlobTransaction({
					...common,
					certificate: saved.certificate,
				});
			else
				client.walrus.certifyBlobTransaction({
					...common,
					confirmations: await client.walrus.getStorageConfirmations({
						blobId: item.blobId,
						deletable: saved.deletable,
						objectId: item.blobObjectId,
					}),
				});
		}
		return transaction;
	}

	#certified(ids: readonly string[], digest: string | null): void {
		for (const id of ids) {
			const work = this.#work.get(id);
			if (work) work.pending = null;
		}
		this.#dispatch({
			type: "certified",
			ids,
			digest,
			atMs: this.#deps.now(),
		});
	}

	async #record(item: TransferItem): Promise<void> {
		const { id } = item;
		this.#dispatch({
			type: "started",
			id,
			step: "record",
			atMs: this.#deps.now(),
		});
		try {
			const work = this.#requireWork(id);
			if (!item.blobId || !item.blobObjectId)
				throw new Error(`${item.name} has no blob to record.`);
			const executor = this.#executor(item);
			const pending = work.pending;
			if (pending?.step === "record") {
				// Still unconfirmed: this throws and the pending digest stays for the next try.
				const record = await this.#confirmPendingRecord(executor, pending);
				work.pending = null;
				if (record) this.#dispatch({ type: "recorded", id, record });
			}
			await recordToMorse({
				executor,
				client: this.#deps.client(item.network),
				network: item.network,
				blobId: item.blobId,
				blobObjectId: item.blobObjectId,
				plan: work.record,
				done: this.#require(id).records,
				onRecorded: (record) =>
					this.#dispatch({ type: "recorded", id, record }),
			});
			this.#dispatch({ type: "record-finished", id, atMs: this.#deps.now() });
		} catch (error) {
			const work = this.#work.get(id);
			if (work && error instanceof RecordUnconfirmedError)
				work.pending = {
					step: "record",
					digest: error.digest,
					target: error.target,
				};
			this.#fail(id, "record", error);
		}
		await this.#afterStep(id);
	}

	/**
	 * Reads back a Morse transaction whose result was lost. `null` when it
	 * failed on chain, so the record step makes it again.
	 */
	async #confirmPendingRecord(
		executor: WalletExecutor,
		pending: Extract<Pending, { step: "record" }>,
	): Promise<TransferRecord | null> {
		try {
			return await confirmRecord(executor, pending.target, pending.digest);
		} catch (error) {
			if (error instanceof TransactionFailedError) return null;
			throw error;
		}
	}

	/**
	 * Runs a signing step and keeps the digest of a transaction that was sent
	 * but not confirmed, so Retry reads it instead of signing again.
	 */
	async #signOnce(
		works: ItemWork | readonly ItemWork[],
		step: "register" | "certify",
		sign: () => Promise<ExecutedTransaction>,
	): Promise<ExecutedTransaction> {
		try {
			return await sign();
		} catch (error) {
			if (error instanceof TransactionUnconfirmedError)
				for (const work of Array.isArray(works) ? works : [works])
					work.pending = { step, digest: error.digest };
			throw error;
		}
	}

	/** Forgets a done item, or saves its progress for Finish after a reload. */
	async #afterStep(id: string): Promise<void> {
		const item = this.#item(id);
		if (!item) return;
		if (item.status.kind === "done") {
			this.#work.delete(id);
			this.#deps.onDone(item);
			await this.#forget(id);
			return;
		}
		const work = this.#work.get(id);
		if (work?.saved) {
			work.saved = { ...work.saved, item, record: work.record };
			await this.#save(work.saved);
		}
	}

	/** Saving for Finish never fails an upload; the queue says when it could not. */
	async #save(upload: SavedUpload): Promise<void> {
		try {
			await this.#deps.savedUploads.save(upload);
		} catch (error) {
			this.#dispatch({
				type: "noticed",
				notice: `Uploads could not be saved for Finish after a reload: ${errorMessage(error)}`,
			});
		}
	}

	async #forget(id: string): Promise<void> {
		try {
			await this.#deps.savedUploads.remove(id);
		} catch (error) {
			this.#dispatch({
				type: "noticed",
				notice: `A finished upload could not be removed from saved uploads: ${errorMessage(error)}`,
			});
		}
	}

	#require(id: string): TransferItem {
		const item = this.#item(id);
		if (!item) throw new Error("The transfer is no longer in the queue.");
		return item;
	}

	#requireWork(id: string): ItemWork {
		const work = this.#work.get(id);
		if (!work) throw new Error("The transfer is no longer in the queue.");
		return work;
	}
}

/**
 * Whether a failed step can run again with what the queue still holds:
 * upload steps need the file, so not after a reload; certify and record
 * work from the saved state.
 */
function canRetry(step: TransferStep, work: ItemWork | undefined): boolean {
	if (!work) return false;
	if (step === "certify" || step === "record") return work.saved !== null;
	if (step === "upload" || step === "register")
		return work.job !== null && work.flow !== null;
	return work.job !== null;
}

/** A failure as the queue row says it. */
function describeError(error: unknown): string {
	if (error instanceof WalletRejectedError) return error.message;
	if (error instanceof WalletPopupBlockedError)
		return `${error.message} Press Sign to continue.`;
	if (error instanceof ConnectionTimeoutError)
		return "The upload relay timed out.";
	if (
		error instanceof TransactionUnconfirmedError ||
		error instanceof RecordUnconfirmedError
	)
		return `${error.message} Retry checks it first, so nothing is paid twice.`;
	return errorMessage(error);
}

/** A blob object from chain; `null` when it no longer exists. */
async function readBlob(
	client: NetworkClient,
	blobObjectId: string | null,
): Promise<BlobRecord | null> {
	if (!blobObjectId) return null;
	const { objects } = await client.core.getObjects({
		objectIds: [blobObjectId],
		include: { content: true },
	});
	const [object] = objects;
	if (
		!object ||
		(object instanceof ObjectError && object.reason === "notFound")
	)
		return null;
	if (object instanceof Error) throw object;
	return parseBlob(object.content, {});
}
