import type { RecipientFile, RecipientFileId } from "@arcadiasystems/morse-sdk";
import { useCallback, useEffect, useState } from "react";
import type { LoadStatus, UseRecipientFileResult } from "./types.js";
import { useMorseFilesContext } from "./use-morse-files-context.js";

/** Load a RecipientFile's on-chain metadata by id. Loads on mount. */
export function useRecipientFile(
	fileId: RecipientFileId | null,
): UseRecipientFileResult {
	const { reader } = useMorseFilesContext();
	const [status, setStatus] = useState<LoadStatus>("idle");
	const [file, setFile] = useState<RecipientFile | null>(null);
	const [error, setError] = useState<unknown>(null);

	const refresh = useCallback(async (): Promise<RecipientFile | null> => {
		if (fileId === null) {
			return null;
		}
		setStatus("loading");
		setError(null);
		try {
			const loaded = await reader.getRecipientFile(fileId);
			setFile(loaded);
			setStatus("success");
			return loaded;
		} catch (err) {
			setError(err);
			setStatus("error");
			throw err;
		}
	}, [reader, fileId]);

	useEffect(() => {
		if (fileId !== null) {
			refresh().catch(() => undefined);
		}
	}, [refresh, fileId]);

	return { status, file, error, refresh };
}
