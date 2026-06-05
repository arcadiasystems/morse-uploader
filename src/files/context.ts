import { createContext } from "react";
import type { MorseFilesHandles } from "./types.js";

/**
 * Holds the injected SDK handles for the files flow. Null until a
 * {@link MorseFilesProvider} supplies them; the consumer hook throws on null.
 */
export const MorseFilesContext = createContext<MorseFilesHandles | null>(null);
