/**
 * Types for the 0.4.0 RecipientFile module. A RecipientFile carries its
 * recipient set directly; there is no separate allowlist object. Declarations
 * only; no runtime code.
 */

import type {
	FileUploadProgressEvent,
	NetworkConfig,
	PubkeyCache,
	RecipientFile,
	RecipientFileId,
	RecipientFilesReader,
	SealAdapter,
	SuiAddress,
	WalletAdapter,
	WalletSignPersonalMessage,
	WalletSignTransaction,
	WalletStandardAccount,
	WalrusFlowCapable,
	WalrusReadAdapter,
	WalrusWriteAdapter,
} from "@arcadiasystems/morse-sdk";
import type { KeyServerConfig, SealCompatibleClient } from "@mysten/seal";
import type { Signer } from "@mysten/sui/cryptography";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import type { Transaction } from "@mysten/sui/transactions";

/** Wallet callbacks the setup hook needs (typically from dapp-kit mutateAsync). */
export interface MorseFilesWalletCallbacks {
	readonly signTransaction: WalletSignTransaction;
	readonly signPersonalMessage: WalletSignPersonalMessage;
	readonly signAndExecuteTransaction: (input: {
		transaction: Transaction;
	}) => Promise<{ digest: string }>;
}

/** Options for the {@link useMorseFiles} setup hook. */
export interface UseMorseFilesOptions {
	readonly network: "testnet" | "mainnet";
	readonly account: WalletStandardAccount;
	readonly callbacks: MorseFilesWalletCallbacks;
	/**
	 * A `SuiGrpcClient` to build and read with. Provide one pointed at a
	 * dedicated RPC so it resolves the same chain state your wallet executes
	 * against (the public load-balanced endpoint can skew object versions and
	 * fail the certify step). Defaults to a gRPC client on the network's public
	 * RPC. Must be a gRPC client; the SDK relies on its method surface.
	 */
	readonly suiClient?: SuiGrpcClient;
	/** Prebuilt flow-capable Walrus write adapter; overrides the default. */
	readonly walrusWrite?: WalrusWriteAdapter & WalrusFlowCapable;
	/** Options for the default direct write adapter (wasm/relay), if not overridden. */
	readonly walrusWriteConfig?: {
		readonly wasmUrl?: string;
		readonly uploadRelay?: {
			readonly host: string;
			readonly sendTip?: unknown;
		};
	};
	/** Prebuilt Walrus read adapter; defaults to the aggregator. */
	readonly walrusRead?: WalrusReadAdapter;
	/** Prebuilt Seal adapter; overrides the default and `sealKeyServers`. */
	readonly seal?: SealAdapter;
	/**
	 * Seal key servers for the default adapter. Testnet pins an open set, so
	 * this is only needed on mainnet, where every operator is commercial and
	 * `morseConfig` therefore pins none. Start from the SDK's
	 * `MAINNET_SEAL_COMMITTEE` and add the `apiKeyName` / `apiKey` your
	 * operator issues. Without it, `handles.seal` is `null` and only the
	 * unencrypted paths work.
	 */
	readonly sealKeyServers?: readonly KeyServerConfig[];
	/** Pubkey cache for fromAccountAsync; defaults to BrowserStoragePubkeyCache. */
	readonly pubkeyCache?: PubkeyCache;
}

/** The injected SDK objects the files hooks and components consume. */
export interface MorseFilesHandles {
	/** The network the handles were built for; drives USD epoch pricing. */
	readonly network: "testnet" | "mainnet";
	/**
	 * The full `morseConfig({ network })` output. It must include
	 * `recipientFileEventOriginPackageId`; the upload helpers need it to match
	 * created objects by their type-origin package after a contract upgrade.
	 */
	readonly config: NetworkConfig;
	/** Sui client (also the SealCompatibleClient used for SessionKey). */
	readonly client: SealCompatibleClient;
	readonly address: SuiAddress;
	/** WalletAdapter for ops (the on-chain PTBs). */
	readonly adapter: WalletAdapter;
	/** Sui signer for Walrus writes and the Seal SessionKey. */
	readonly signer: Signer;
	/** Flow-capable write adapter (required for the single-PTB file ops). */
	readonly walrusWrite: WalrusWriteAdapter & WalrusFlowCapable;
	readonly walrusRead: WalrusReadAdapter;
	/**
	 * `null` when no Seal key servers are available, which on mainnet means no
	 * credential was supplied. Unencrypted upload and download still work; the
	 * encrypted paths reject with a message naming `sealKeyServers`.
	 *
	 * Nullable rather than absent so the setup hook still succeeds: building it
	 * eagerly would fail the whole hook on mainnet and take the public flows
	 * down with it.
	 */
	readonly seal: SealAdapter | null;
	readonly reader: RecipientFilesReader;
}

/** Status of the async {@link useMorseFiles} setup. */
export type SetupStatus = "idle" | "preparing" | "ready" | "error";

/** Return value of {@link useMorseFiles}. */
export interface UseMorseFilesResult {
	readonly status: SetupStatus;
	readonly handles: MorseFilesHandles | null;
	readonly error: unknown;
}

/** A single upload progress phase. */
export type FilePhase = FileUploadProgressEvent["phase"];

/** Status of a single upload tracked by {@link useFileUpload}. */
export type FileUploadStatus = "idle" | "uploading" | "success" | "error";

/** The Seal identity material returned by an encrypted upload. */
export interface SealMaterial {
	readonly sealIdPrefix: Uint8Array;
	readonly sealNonce: Uint8Array;
}

/** Input to the {@link useFileUpload} upload action. */
export interface FileUploadInput {
	readonly file: File;
	/** Wallets that can decrypt (encrypted) or are tagged as recipients (public). The owner is auto-added on chain. */
	readonly recipients?: readonly SuiAddress[];
	/** Encrypt under Seal; the recipient set gates decryption. */
	readonly encrypt?: boolean;
	readonly epochs: number;
	readonly deletable?: boolean;
}

/** A completed upload plus its share link. */
export interface CompletedFileUpload {
	readonly fileId: RecipientFileId;
	readonly blobId: string;
	readonly encrypted: boolean;
	/** Present for encrypted uploads; persist with the nonce so recipients can decrypt. */
	readonly sealIdPrefix: Uint8Array | null;
	readonly sealNonce: Uint8Array | null;
	readonly shareLink: string;
}

/** Return value of {@link useFileUpload}. */
export interface UseFileUploadResult {
	readonly status: FileUploadStatus;
	readonly phase: FilePhase | null;
	readonly data: CompletedFileUpload | null;
	readonly error: unknown;
	readonly upload: (input: FileUploadInput) => Promise<CompletedFileUpload>;
	readonly reset: () => void;
}

/** Status of a decrypt/download tracked by {@link useFileDecrypt}. */
export type FileDecryptStatus = "idle" | "working" | "success" | "error";

/** Input to {@link useFileDecrypt} decrypt action. */
export interface FileDecryptInput {
	readonly file: RecipientFile;
	/** Seal identity material from the share link or your store. */
	readonly sealIdPrefix: Uint8Array;
	readonly sealNonce: Uint8Array;
	readonly ttlMin?: number;
}

/** Return value of {@link useFileDecrypt}. */
export interface UseFileDecryptResult {
	readonly status: FileDecryptStatus;
	readonly data: Uint8Array | null;
	readonly error: unknown;
	readonly decrypt: (input: FileDecryptInput) => Promise<Uint8Array>;
	readonly reset: () => void;
}

/** Generic load status for the read hooks. */
export type LoadStatus = "idle" | "loading" | "success" | "error";

/** Return value of {@link useRecipientFile}. */
export interface UseRecipientFileResult {
	readonly status: LoadStatus;
	readonly file: RecipientFile | null;
	readonly error: unknown;
	readonly refresh: () => Promise<RecipientFile | null>;
}

/** Options for the {@link useStorageCostEstimate} hook. */
export interface UseStorageCostEstimateOptions {
	readonly sizeBytes: number;
	readonly epochs: number;
	/** Add the Seal envelope overhead to the priced size. */
	readonly encrypt?: boolean;
	/** Override the default $0.023/GB/month rate. */
	readonly usdPerGbPerMonth?: number;
}

/** Return value of {@link useStorageCostEstimate}. */
export interface UseStorageCostEstimateResult {
	readonly estimate: UsdCostEstimate;
}

/** Load/work status for {@link useFileDownload}. */
export type FileDownloadStatus = "idle" | "loading" | "ready" | "error";

/**
 * Why a share link cannot open the encrypted file it names: it carries no Seal
 * material (`"missing"`), or its Seal prefix is not the file's (`"mismatch"`).
 */
export type ShareLinkSealErrorReason = "missing" | "mismatch";

/** Return value of {@link useFileDownload}. */
export interface UseFileDownloadResult {
	/** Status of the on-chain metadata load. */
	readonly metaStatus: LoadStatus;
	readonly file: RecipientFile | null;
	/** Status of fetching (and decrypting) the bytes. */
	readonly status: FileDownloadStatus;
	/** Object URL for the fetched bytes; null until loaded. */
	readonly objectUrl: string | null;
	/**
	 * True when the share link carries Seal material, so `load` decrypts. A file
	 * with an on-chain Seal prefix opened from a link without that material
	 * reads false here, and `load` fails with a {@link ShareLinkSealError}
	 * instead of serving it.
	 */
	readonly encrypted: boolean;
	/** True when the content type is a previewable image. */
	readonly isImage: boolean;
	/**
	 * Why the last `load` or `download` failed. A {@link ShareLinkSealError}
	 * when the file is encrypted on chain and the link cannot open it; render
	 * any value with {@link downloadErrorMessage}.
	 */
	readonly error: unknown;
	/** Fetch the bytes (public read or Seal decrypt) and build the object URL. */
	readonly load: () => Promise<void>;
	/** Trigger a browser download of the already-loaded bytes. */
	readonly save: () => void;
	/** Load (if needed) and download in one call. */
	readonly download: () => Promise<void>;
}

/** Arguments for {@link estimateStorageUsd}. */
export interface UsdCostArgs {
	readonly sizeBytes: number;
	readonly epochs: number;
	/** Epoch length in ms; see {@link epochDurationMs} for the nominal values. */
	readonly epochDurationMs: number;
	/** Bytes the Seal envelope adds when encrypting; folded into the priced size. */
	readonly encryptionOverheadBytes?: number;
	/** Override the default $0.023/GB/month rate. */
	readonly usdPerGbPerMonth?: number;
}

/** Result of {@link estimateStorageUsd}. */
export interface UsdCostEstimate {
	readonly usd: number;
	readonly gb: number;
	readonly months: number;
	/** Storage duration in days (epochs times the network epoch length). */
	readonly days: number;
	readonly sizeBytes: number;
}

/** Props for the `<MorseFileUploader>` drop-in component. */
export interface MorseFileUploaderProps {
	readonly className?: string;
	/** Recipient wallets (the connected wallet is auto-added on chain). */
	readonly recipients?: readonly SuiAddress[];
	/** Encrypt the file under Seal so only recipients can decrypt. */
	readonly encrypt?: boolean;
	/** Default storage duration in epochs. */
	readonly defaultEpochs?: number;
	/** Minimum selectable epochs. Defaults to 1. */
	readonly minEpochs?: number;
	/** Maximum selectable epochs. Defaults to the Walrus lease cap (53). */
	readonly maxEpochs?: number;
	/** Called when an upload completes; receives the seal material and share link. */
	readonly onUploaded?: (result: CompletedFileUpload) => void;
}

/** Props for the `<MorseFileDownloader>` drop-in component. */
export interface MorseFileDownloaderProps {
	/** The on-chain RecipientFile id (from the share link). */
	readonly fileId: RecipientFileId;
	/** Seal material for encrypted files; omit/null for public files. */
	readonly sealIdPrefix?: Uint8Array | null;
	readonly sealNonce?: Uint8Array | null;
	readonly className?: string;
}

/** Arguments for {@link buildShareLink}. */
export interface BuildShareLinkArgs {
	/** The on-chain RecipientFile object id. */
	readonly fileId: string;
	/**
	 * Seal identity material, persisted so recipients can decrypt. Not a secret:
	 * decryption is still gated by the file's recipient set. Omit for public files.
	 */
	readonly sealIdPrefix?: Uint8Array;
	readonly sealNonce?: Uint8Array;
	/** Base URL; defaults to the current browser origin. */
	readonly baseUrl?: string;
	/** Fragment path pattern containing `:fileId`; defaults to `/#/f/:fileId`. */
	readonly pattern?: string;
	/**
	 * Network the file lives on, carried in the link as `net`. A file id means
	 * nothing without it: the same id on the other network is simply not found.
	 */
	readonly network?: "testnet" | "mainnet";
}

/** Result of {@link parseShareLink}. */
export interface ParsedShareLink {
	readonly fileId: string;
	/** Seal material if present in the link, else null (public file). */
	readonly sealIdPrefix: Uint8Array | null;
	readonly sealNonce: Uint8Array | null;
	/**
	 * Network from the link's `net`, or null when the link omits it or names
	 * one this version does not know. Read it before looking the file up; the
	 * id resolves on one network only.
	 */
	readonly network: "testnet" | "mainnet" | null;
}
