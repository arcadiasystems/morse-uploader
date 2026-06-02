import type { ReactElement, ReactNode } from "react";
import type { MorseUploaderContextValue } from "../types.js";
import { MorseUploaderContext } from "./morse-uploader-context.js";

/** Props for {@link MorseUploaderProvider}. */
export interface MorseUploaderProviderProps {
	/**
	 * Injected deps + upload defaults. Memoize this in the host (as the demo's
	 * useMorse hook does) so consumers do not re-render on every parent render.
	 */
	readonly value: MorseUploaderContextValue;
	readonly children: ReactNode;
}

/**
 * Provides injected SDK deps and upload defaults to the morse-uploader hooks
 * and primitives. The host owns wallet connection and constructs `value`.
 */
export function MorseUploaderProvider({
	value,
	children,
}: MorseUploaderProviderProps): ReactElement {
	return (
		<MorseUploaderContext.Provider value={value}>
			{children}
		</MorseUploaderContext.Provider>
	);
}
