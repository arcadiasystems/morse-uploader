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
	SealId,
	SuiAddress,
	WalletAdapter,
	WalrusBlobId,
	WalrusWriteAdapter,
} from "@arcadiasystems/morse-sdk";

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
	/** Required to list a user's files (useMorseFiles). */
	readonly reader?: PublicationReader;
	/** The connected account address; used to list files across owned publications. */
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
