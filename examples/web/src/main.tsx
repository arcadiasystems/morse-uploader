import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Providers } from "./providers";

const container = document.getElementById("root");
if (container === null) {
	throw new Error("Missing #root element");
}

createRoot(container).render(
	<StrictMode>
		<Providers>
			<App />
		</Providers>
	</StrictMode>,
);
