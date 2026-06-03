/**
 * Shared public types for morse-uploader. Type declarations only: no runtime
 * code lives here, so the one-function-per-file rule does not apply.
 */

import type {
	BlobObjectId,
	BlobRef,
	MorsePackageConfig,
	ProgressCallback,
	ProgressEvent,
	PublicationId,
	PublicationReader,
	PublisherCapId,
	SealAdapter,
	SealId,
	SuiAddress,
	WalletAdapter,
	WalrusBlobId,
	WalrusReadAdapter,
	WalrusWriteAdapter,
} from "@arcadiasystems/morse-sdk";
import type { SealCompatibleClient, SessionKey } from "@mysten/seal";
import type { Signer } from "@mysten/sui/cryptography";

/** Options controlling how {@link buildShareUrl} builds a link to an uploaded blob. */
export interface BuildShareUrlOptions {
	/**
	 * Base URL of the host app, e.g. "https://app.example.com". Takes priority
	 * over the detected browser origin when present.
	 */
	readonly appBaseUrl?: string;
	/**
	 * Path pattern containing the ":blobId" token, appended to the app base.
	 * Defaults to "/f/:blobId".
	 */
	readonly pattern?: string;
	/**
	 * Walrus aggregator base URL. Used as a fallback when no app base and no
	 * browser origin are available; produces the canonical "/v1/blobs/:blobId"
	 * view URL.
	 */
	readonly aggregatorBaseUrl?: string;
}

/**
 * Identifies where a file is published when running in Morse-entry mode. When
 * omitted from {@link UploadFileArgs}, the uploader stays in simple blob mode.
 */
export interface MorseUploaderTarget {
	readonly publicationId: PublicationId;
	readonly publisherCapId: PublisherCapId;
	readonly collectionName: string;
}

/** Dependencies for {@link uploadFile}. */
export interface UploadFileDeps {
	readonly config: MorsePackageConfig;
	/**
	 * Walrus write adapter: direct (`DefaultWalrusWriteAdapter`) or custom
	 * publisher (`HttpPublisherWriteAdapter`). The upload path adapts to whether
	 * the adapter is flow-capable.
	 */
	readonly walrus: WalrusWriteAdapter;
	/**
	 * Wallet signer. Required for Morse-entry mode (when a target is given). Not
	 * needed in simple blob mode, where the adapter signs (direct) or the
	 * publisher signs server-side.
	 */
	readonly adapter?: WalletAdapter;
	/** Seal adapter. Required only when `encrypt` is set. */
	readonly seal?: SealAdapter;
}

/** Arguments for {@link uploadFile}. */
export interface UploadFileArgs {
	readonly bytes: Uint8Array;
	readonly name: string;
	readonly contentType: string;
	/** Number of Walrus epochs to store the blob for. */
	readonly epochs: number;
	/**
	 * Defaults to true. The Move layer rejects non-deletable blobs, so entry mode
	 * always needs true; kept configurable for simple blob uploads.
	 */
	readonly deletable?: boolean;
	/** When provided, the file is published as a Morse entry; otherwise a plain Walrus blob. */
	readonly target?: MorseUploaderTarget;
	/** Encrypt with Seal before upload. Requires a target and a seal adapter. */
	readonly encrypt?: boolean;
	readonly onProgress?: ProgressCallback;
	readonly signal?: AbortSignal;
}

/** Result of a plain Walrus blob upload (simple mode). */
export interface BlobUploadResult {
	readonly mode: "blob";
	readonly blobId: WalrusBlobId;
	readonly blobObjectId: BlobObjectId;
}

/** Result of a published Morse entry upload (entry mode). */
export interface EntryUploadResult {
	readonly mode: "entry";
	readonly blobId: WalrusBlobId;
	readonly blobObjectId: BlobObjectId;
	readonly entryId: number;
	readonly revisionId: number;
	readonly digest: string;
	readonly gasUsedMist: bigint;
	readonly encrypted: boolean;
	/** The Seal identity bound to the entry when encrypted; null otherwise. */
	readonly sealId: SealId | null;
}

/** Discriminated result of {@link uploadFile}; narrow on `mode`. */
export type UploadFileResult = BlobUploadResult | EntryUploadResult;

/** A single coarse-grained upload progress phase. */
export type ProgressPhase = ProgressEvent["phase"];

/** Injected SDK dependencies the uploader needs. */
export interface MorseUploaderDeps {
	readonly config: MorsePackageConfig;
	readonly walrus: WalrusWriteAdapter;
	/** Required for Morse-entry mode; omit for simple blob uploads. */
	readonly adapter?: WalletAdapter;
	/** Seal adapter, required to upload encrypted files and to decrypt. */
	readonly seal?: SealAdapter;
	/** Read adapter (aggregator recommended in browsers), required to decrypt. */
	readonly walrusRead?: WalrusReadAdapter;
	/** Wallet signer (a Sui Signer, e.g. WalletStandardSigner), required to decrypt. */
	readonly signer?: Signer;
	/** Sui client, required to create the Seal SessionKey when decrypting. */
	readonly client?: SealCompatibleClient;
	/** Walrus client for read-only queries (cost estimate, and later expiry). */
	readonly walrusClient?: WalrusQuerySource;
	/** Required to list a user's files (useMorseFiles). */
	readonly reader?: PublicationReader;
	/** The connected account address; used to list files and to create a SessionKey. */
	readonly address?: SuiAddress;
}

/** Defaults and link options carried by the provider. */
export interface MorseUploaderOptions {
	/** Default Walrus storage duration, shown in the UI and used when an upload omits epochs. */
	readonly defaultEpochs?: number;
	/** Default publication target; an upload can override it per call. */
	readonly target?: MorseUploaderTarget;
	/** Options for building share links from upload results. */
	readonly shareUrl?: BuildShareUrlOptions;
}

/** Value held by the MorseUploader context. */
export type MorseUploaderContextValue = MorseUploaderDeps &
	MorseUploaderOptions;

/** Status of a single upload tracked by `useMorseUploader`. */
export type UploadStatus = "idle" | "uploading" | "success" | "error";

/** Input to the `useMorseUploader` upload action. */
export interface UploadInput {
	readonly file: File;
	/** Overrides the provider default for this upload. */
	readonly epochs?: number;
	readonly deletable?: boolean;
	/** Overrides the provider default target for this upload. */
	readonly target?: MorseUploaderTarget;
	/** Encrypt with Seal before upload. Requires a target and a seal adapter. */
	readonly encrypt?: boolean;
	readonly signal?: AbortSignal;
}

/** A successful upload plus its computed share link (null when one cannot be built). */
export interface CompletedUpload {
	readonly result: UploadFileResult;
	readonly shareUrl: string | null;
}

/** Return value of `useMorseUploader`. */
export interface UseMorseUploaderResult {
	readonly status: UploadStatus;
	readonly phase: ProgressPhase | null;
	readonly data: CompletedUpload | null;
	readonly error: unknown;
	readonly upload: (input: UploadInput) => Promise<CompletedUpload>;
	readonly reset: () => void;
}

/**
 * One of a user's files: the current revision of a Morse entry, flattened for
 * display. Byte size and expiry are not on-chain on the entry; resolve expiry
 * separately with {@link computeExpiry} plus the Walrus epoch schedule.
 */
export interface MorseFile {
	readonly publicationId: PublicationId;
	readonly collectionName: string;
	readonly entryId: number;
	readonly name: string;
	readonly revisionId: number;
	readonly contentType: string;
	readonly encrypted: boolean;
	readonly sealId: SealId | null;
	readonly blobRef: BlobRef;
	/** Present only when the revision stores a whole blob (not a quilt patch). */
	readonly blobObjectId?: BlobObjectId;
}

/** Options for {@link listUserFiles}. Provide a collection scope or an owner address. */
export interface ListUserFilesOptions {
	readonly publicationId?: PublicationId;
	readonly collectionName?: string;
	readonly address?: SuiAddress;
	readonly signal?: AbortSignal;
}

/** Load status for {@link useMorseFiles}. */
export type FilesStatus = "idle" | "loading" | "success" | "error";

/** Options for {@link useMorseFiles}; overrides the provider's target/address. */
export interface UseMorseFilesOptions {
	readonly publicationId?: PublicationId;
	readonly collectionName?: string;
	readonly address?: SuiAddress;
	/** Load on mount and when the scope changes (default true). */
	readonly autoLoad?: boolean;
}

/** Return value of {@link useMorseFiles}. */
export interface UseMorseFilesResult {
	readonly status: FilesStatus;
	readonly files: readonly MorseFile[];
	readonly error: unknown;
	readonly refresh: () => Promise<readonly MorseFile[]>;
}

/**
 * Walrus epoch schedule needed to convert a storage end-epoch to wall-clock
 * time. Source it from a Walrus client's staking state (see {@link fetchEpochSchedule}).
 */
export interface EpochSchedule {
	readonly currentEpoch: number;
	readonly epochDurationMs: number;
	/** Start of epoch 0 in ms since the Unix epoch, when known; enables absolute dates. */
	readonly firstEpochStartMs?: number;
}

/** Computed expiry for a stored blob. */
export interface FileExpiry {
	readonly endEpoch: number;
	readonly expiresAtMs: number;
	readonly expiresInMs: number;
	readonly expired: boolean;
}

/** Minimal Walrus client surface for the epoch schedule (satisfied by `WalrusClient`). */
export interface WalrusEpochSource {
	stakingState(): Promise<{
		readonly epoch: number;
		readonly epoch_duration: string;
		readonly first_epoch_start: string;
	}>;
}

/** Minimal Walrus client surface for a blob's end epoch (satisfied by `WalrusClient`). */
export interface WalrusBlobObjectSource {
	getBlobObject(
		blobObjectId: string,
	): Promise<{ readonly storage: { readonly end_epoch: number } }>;
}

/** Minimal Walrus client surface for storage pricing (satisfied by `WalrusClient`). */
export interface WalrusStorageCostSource {
	storageCost(
		size: number,
		epochs: number,
	): Promise<{
		readonly storageCost: bigint;
		readonly writeCost: bigint;
		readonly totalCost: bigint;
	}>;
}

/**
 * Combined query surface for the read-only Walrus lookups this package can use
 * (pricing, epoch schedule, blob objects). A real `WalrusClient` satisfies it.
 */
export type WalrusQuerySource = WalrusStorageCostSource &
	WalrusEpochSource &
	WalrusBlobObjectSource;

/** WAL storage cost in FROST (WAL's smallest unit). */
export interface StorageCostEstimate {
	readonly storageCostFrost: bigint;
	readonly writeCostFrost: bigint;
	readonly totalCostFrost: bigint;
}

/** Arguments for {@link estimateEpochCost}. */
export interface EpochCostArgs {
	readonly sizeBytes: number;
	readonly epochs: number;
	/** Account for Seal envelope overhead in the size used for pricing. */
	readonly encrypt?: boolean;
	/** Bytes added when encrypt is set; defaults to DEFAULT_ENCRYPTION_OVERHEAD_BYTES. */
	readonly encryptionOverheadBytes?: number;
	/**
	 * Optional fixed SUI gas estimate in MIST. The publish PTB cannot be built
	 * before upload, so gas is supplied by the caller rather than dry-run here.
	 */
	readonly suiGasMist?: bigint;
}

/** Result of {@link estimateEpochCost}. */
export interface EpochCostEstimate {
	readonly sizeBytes: number;
	readonly epochs: number;
	readonly encrypted: boolean;
	readonly storage: StorageCostEstimate;
	/** Total WAL cost in FROST (storage + write). */
	readonly walFrost: bigint;
	/** SUI gas in MIST when supplied by the caller, else null. */
	readonly suiGasMist: bigint | null;
}

/** Status of a cost estimate tracked by {@link useEpochCostEstimate}. */
export type CostStatus = "idle" | "loading" | "success" | "error";

/** Inputs to {@link useEpochCostEstimate}; the estimate recomputes when they change. */
export interface UseEpochCostEstimateOptions {
	readonly sizeBytes: number;
	readonly epochs: number;
	readonly encrypt?: boolean;
	readonly suiGasMist?: bigint;
	/** Compute on mount and when inputs change (default true). */
	readonly enabled?: boolean;
}

/** Return value of {@link useEpochCostEstimate}. */
export interface UseEpochCostEstimateResult {
	readonly status: CostStatus;
	readonly estimate: EpochCostEstimate | null;
	readonly error: unknown;
	readonly refresh: () => Promise<EpochCostEstimate | null>;
}

/** Dependencies for {@link decryptFile}. */
export interface DecryptFileDeps {
	readonly seal: SealAdapter;
	readonly walrusRead: WalrusReadAdapter;
	/** Creates a fresh Seal SessionKey (one wallet signature). Called again on a session-expired retry. */
	readonly createSessionKey: () => Promise<SessionKey>;
}

/** Arguments for {@link decryptFile}. */
export interface DecryptFileArgs {
	readonly blobRef: BlobRef;
	readonly sealId: SealId;
	readonly publisherCapId: PublisherCapId;
	readonly signal?: AbortSignal;
}

/** Status of a decrypt operation tracked by {@link useDecryptedBlob}. */
export type DecryptStatus = "idle" | "decrypting" | "success" | "error";

/** Input to the {@link useDecryptedBlob} decrypt action. */
export interface DecryptInput {
	readonly blobRef: BlobRef;
	readonly sealId: SealId;
	/** Defaults to the provider target's publisherCapId. */
	readonly publisherCapId?: PublisherCapId;
	/** SessionKey lifetime in minutes; defaults to DEFAULT_SESSION_TTL_MIN. */
	readonly ttlMin?: number;
	readonly signal?: AbortSignal;
}

/** Return value of {@link useDecryptedBlob}. */
export interface UseDecryptedBlobResult {
	readonly status: DecryptStatus;
	readonly data: Uint8Array | null;
	readonly error: unknown;
	readonly decrypt: (input: DecryptInput) => Promise<Uint8Array>;
	readonly reset: () => void;
}
