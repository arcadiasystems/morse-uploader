import { useContext } from "react";
import type { MorseUploaderContextValue } from "../types.js";
import { MorseUploaderContext } from "./morse-uploader-context.js";

/**
 * Read the MorseUploader context.
 *
 * @throws {Error} when used outside a {@link MorseUploaderProvider}.
 */
export function useMorseUploaderContext(): MorseUploaderContextValue {
	const value = useContext(MorseUploaderContext);
	if (value === null) {
		throw new Error(
			"useMorseUploaderContext must be used within a MorseUploaderProvider.",
		);
	}
	return value;
}
