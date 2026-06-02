/**
 * Shared public types for morse-uploader. Type declarations only: no runtime
 * code lives here, so the one-function-per-file rule does not apply.
 */

import type {
	BlobObjectId,
	MorsePackageConfig,
	ProgressCallback,
	ProgressEvent,
	PublicationId,
	PublisherCapId,
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
