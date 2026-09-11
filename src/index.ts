/**
 * Public entry point for @arcadiasystems/morse-uploader.
 *
 * Headless React hooks for the morse-sdk RecipientFile flow: setup
 * (`useMorseFiles`), upload/download, Seal decrypt, plus the share-link and
 * USD-cost helpers. The optional styled components live in the `./ui` entry.
 * See the README.
 */

export { DEFAULT_ENCRYPTION_OVERHEAD_BYTES } from "./constants/default-encryption-overhead-bytes.js";
export { buildShareLink } from "./files/build-share-link.js";
export { epochDurationMs } from "./files/epoch-duration-ms.js";
export { estimateStorageUsd } from "./files/estimate-storage-usd.js";
export {
	MorseFilesProvider,
	type MorseFilesProviderProps,
} from "./files/morse-files-provider.js";
export { parseShareLink } from "./files/parse-share-link.js";
export { resolveSealServers } from "./files/resolve-seal-servers.js";
export type {
	BuildShareLinkArgs,
	CompletedFileUpload,
	FileDecryptInput,
	FileDecryptStatus,
	FileDownloadStatus,
	FilePhase,
	FileUploadInput,
	FileUploadStatus,
	LoadStatus,
	MorseFileDownloaderProps,
	MorseFilesHandles,
	MorseFilesWalletCallbacks,
	MorseFileUploaderProps,
	ParsedShareLink,
	SealMaterial,
	SetupStatus,
	UsdCostArgs,
	UsdCostEstimate,
	UseFileDecryptResult,
	UseFileDownloadResult,
	UseFileUploadResult,
	UseMorseFilesOptions,
	UseMorseFilesResult,
	UseRecipientFileResult,
	UseStorageCostEstimateOptions,
	UseStorageCostEstimateResult,
} from "./files/types.js";
export { uploadErrorMessage } from "./files/upload-error-message.js";
export { uploadPhaseLabel } from "./files/upload-phase-label.js";
export { uploadPhases } from "./files/upload-phases.js";
export { useFileDecrypt } from "./files/use-file-decrypt.js";
export { useFileDownload } from "./files/use-file-download.js";
export { useFileUpload } from "./files/use-file-upload.js";
export { useMorseFiles } from "./files/use-morse-files.js";
export { useMorseFilesContext } from "./files/use-morse-files-context.js";
export { useRecipientFile } from "./files/use-recipient-file.js";
export { useStorageCostEstimate } from "./files/use-storage-cost-estimate.js";
export { useClipboard } from "./primitives/use-clipboard.js";
export { useDropzone } from "./primitives/use-dropzone.js";
export type {
	DropzoneInputProps,
	DropzoneRootProps,
	UseClipboardResult,
	UseDropzoneOptions,
	UseDropzoneResult,
} from "./types.js";
export { bytesToHex } from "./utils/bytes-to-hex.js";
export { formatBytes } from "./utils/format-bytes.js";
export { formatUsd } from "./utils/format-usd.js";
export { hexToBytes } from "./utils/hex-to-bytes.js";
export { isPreviewableImage } from "./utils/is-previewable-image.js";
export { resolveOrigin } from "./utils/resolve-origin.js";
export { triggerDownload } from "./utils/trigger-download.js";
