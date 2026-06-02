import { useCallback, useState } from "react";
import { DEFAULT_EPOCHS } from "../constants/default-epochs.js";
import { useMorseUploaderContext } from "../context/use-morse-uploader-context.js";
import { uploadFile } from "../core/upload-file.js";
import type {
	CompletedUpload,
	MorseUploaderTarget,
	ProgressPhase,
	UploadFileDeps,
	UploadInput,
	UploadStatus,
	UseMorseUploaderResult,
} from "../types.js";
import { computeShareUrl } from "../utils/compute-share-url.js";

// Default content type for files the browser could not classify.
const FALLBACK_CONTENT_TYPE = "application/octet-stream";

/**
 * Upload a single file with progress, result, and error state. Composes
 * {@link uploadFile} with the injected provider deps and a computed share link.
 *
 * @throws {Error} (via the returned `upload` promise) on upload or publish
 *   failure; the same error is also exposed as `error`.
 */
export function useMorseUploader(): UseMorseUploaderResult {
	const ctx = useMorseUploaderContext();
	const [status, setStatus] = useState<UploadStatus>("idle");
	const [phase, setPhase] = useState<ProgressPhase | null>(null);
	const [data, setData] = useState<CompletedUpload | null>(null);
	const [error, setError] = useState<unknown>(null);

	const reset = useCallback(() => {
		setStatus("idle");
		setPhase(null);
		setData(null);
		setError(null);
	}, []);

	const upload = useCallback(
		async (input: UploadInput): Promise<CompletedUpload> => {
			setStatus("uploading");
			setPhase(null);
			setData(null);
			setError(null);
			try {
				const bytes = new Uint8Array(await input.file.arrayBuffer());
				const target: MorseUploaderTarget | undefined =
					input.target ?? ctx.target;
				const deps: UploadFileDeps = {
					config: ctx.config,
					walrus: ctx.walrus,
					...(ctx.adapter === undefined ? {} : { adapter: ctx.adapter }),
					...(ctx.seal === undefined ? {} : { seal: ctx.seal }),
				};
				const result = await uploadFile(deps, {
					bytes,
					name: input.file.name,
					contentType: input.file.type || FALLBACK_CONTENT_TYPE,
					epochs: input.epochs ?? ctx.defaultEpochs ?? DEFAULT_EPOCHS,
					...(input.deletable === undefined
						? {}
						: { deletable: input.deletable }),
					...(target === undefined ? {} : { target }),
					...(input.encrypt === undefined ? {} : { encrypt: input.encrypt }),
					onProgress: (event) => setPhase(event.phase),
					...(input.signal === undefined ? {} : { signal: input.signal }),
				});
				const completed: CompletedUpload = {
					result,
					shareUrl: computeShareUrl(result.blobId, ctx.shareUrl),
				};
				setData(completed);
				setStatus("success");
				return completed;
			} catch (err) {
				setError(err);
				setStatus("error");
				throw err;
			}
		},
		[ctx],
	);

	return { status, phase, data, error, upload, reset };
}
