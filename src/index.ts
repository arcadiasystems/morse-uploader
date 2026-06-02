/**
 * Public entry point for @arcadiasystems/morse-uploader.
 *
 * Phase 0 helpers plus the Phase 1 upload core, context/provider, and the
 * `useMorseUploader` hook. The headless primitives and the optional default
 * skin (`./ui`) land in later phases. See the README.
 */

export { DEFAULT_EPOCHS } from "./constants/default-epochs.js";
export { MorseUploaderContext } from "./context/morse-uploader-context.js";
export {
	MorseUploaderProvider,
	type MorseUploaderProviderProps,
} from "./context/morse-uploader-provider.js";
export { useMorseUploaderContext } from "./context/use-morse-uploader-context.js";
export { buildShareUrl } from "./core/build-share-url.js";
export { uploadFile } from "./core/upload-file.js";
export { useMorseUploader } from "./hooks/use-morse-uploader.js";
export type {
	BlobUploadResult,
	BuildShareUrlOptions,
	CompletedUpload,
	EntryUploadResult,
	MorseUploaderContextValue,
	MorseUploaderDeps,
	MorseUploaderOptions,
	MorseUploaderTarget,
	ProgressPhase,
	UploadFileArgs,
	UploadFileDeps,
	UploadFileResult,
	UploadInput,
	UploadStatus,
	UseMorseUploaderResult,
} from "./types.js";
export { computeShareUrl } from "./utils/compute-share-url.js";
export { formatBytes } from "./utils/format-bytes.js";
export { resolveOrigin } from "./utils/resolve-origin.js";
