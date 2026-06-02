import { useCallback, useEffect, useState } from "react";
import { useMorseUploaderContext } from "../context/use-morse-uploader-context.js";
import { listUserFiles } from "../core/list-user-files.js";
import type {
	FilesStatus,
	ListUserFilesOptions,
	MorseFile,
	UseMorseFilesOptions,
	UseMorseFilesResult,
} from "../types.js";

/**
 * List the connected user's files. Scope comes from the options or, by default,
 * the provider's `target` (collection) or `address` (all owned publications).
 * Loads on mount unless `autoLoad` is false.
 *
 * @throws {Error} (via `refresh`) when the context has no reader.
 */
export function useMorseFiles(
	options: UseMorseFilesOptions = {},
): UseMorseFilesResult {
	const ctx = useMorseUploaderContext();
	const [status, setStatus] = useState<FilesStatus>("idle");
	const [files, setFiles] = useState<readonly MorseFile[]>([]);
	const [error, setError] = useState<unknown>(null);

	const { reader } = ctx;
	const publicationId = options.publicationId ?? ctx.target?.publicationId;
	const collectionName = options.collectionName ?? ctx.target?.collectionName;
	const address = options.address ?? ctx.address;
	const autoLoad = options.autoLoad ?? true;

	const load = useCallback(
		async (signal?: AbortSignal): Promise<readonly MorseFile[]> => {
			if (reader === undefined) {
				throw new Error(
					"useMorseFiles requires a reader on the MorseUploader context.",
				);
			}
			setStatus("loading");
			setError(null);
			try {
				const listOptions: ListUserFilesOptions = {
					...(publicationId === undefined ? {} : { publicationId }),
					...(collectionName === undefined ? {} : { collectionName }),
					...(address === undefined ? {} : { address }),
					...(signal === undefined ? {} : { signal }),
				};
				const result = await listUserFiles(reader, listOptions);
				// A newer load (or unmount) aborted this one; do not clobber state.
				if (signal?.aborted) {
					return result;
				}
				setFiles(result);
				setStatus("success");
				return result;
			} catch (err) {
				if (signal?.aborted) {
					throw err;
				}
				setError(err);
				setStatus("error");
				throw err;
			}
		},
		[reader, publicationId, collectionName, address],
	);

	useEffect(() => {
		if (!autoLoad) {
			return;
		}
		const controller = new AbortController();
		// Errors surface through the error state; ignore the rejection here.
		load(controller.signal).catch(() => undefined);
		return () => controller.abort();
	}, [autoLoad, load]);

	const refresh = useCallback(() => load(), [load]);
	return { status, files, error, refresh };
}
