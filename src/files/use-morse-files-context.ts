import { useContext } from "react";
import { MorseFilesContext } from "./context.js";
import type { MorseFilesHandles } from "./types.js";

/**
 * Read the files-flow handles.
 *
 * @throws {Error} when used outside a {@link MorseFilesProvider}.
 */
export function useMorseFilesContext(): MorseFilesHandles {
	const handles = useContext(MorseFilesContext);
	if (handles === null) {
		throw new Error(
			"useMorseFilesContext must be used within a MorseFilesProvider.",
		);
	}
	return handles;
}
