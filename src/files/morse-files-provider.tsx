import type { ReactElement, ReactNode } from "react";
import { MorseFilesContext } from "./context.js";
import type { MorseFilesHandles } from "./types.js";

/** Props for {@link MorseFilesProvider}. */
export interface MorseFilesProviderProps {
	/** The handles from {@link useMorseFiles} (memoized by that hook). */
	readonly value: MorseFilesHandles;
	readonly children: ReactNode;
}

/** Provides the injected files-flow handles to the hooks and components. */
export function MorseFilesProvider({
	value,
	children,
}: MorseFilesProviderProps): ReactElement {
	return (
		<MorseFilesContext.Provider value={value}>
			{children}
		</MorseFilesContext.Provider>
	);
}
