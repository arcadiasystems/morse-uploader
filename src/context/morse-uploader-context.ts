import { createContext } from "react";
import type { MorseUploaderContextValue } from "../types.js";

/**
 * Holds the injected SDK deps and upload defaults. Null until a
 * {@link MorseUploaderProvider} supplies a value; the consumer hook throws on
 * null so misuse fails loudly.
 */
export const MorseUploaderContext =
	createContext<MorseUploaderContextValue | null>(null);
