import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";

const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The example consumes the library's built dist (real .js files, so Vite
// resolves them directly). Build the library first: `bun run build` at the repo
// root. @mysten/walrus ships wasm and uses top-level await.
export default defineConfig({
	plugins: [react(), wasm(), topLevelAwait()],
	resolve: {
		alias: [
			{
				find: /^@arcadiasystems\/morse-uploader\/styles\.css$/,
				replacement: fromHere("../../dist/styles.css"),
			},
			{
				find: /^@arcadiasystems\/morse-uploader\/ui$/,
				replacement: fromHere("../../dist/ui.js"),
			},
			{
				find: /^@arcadiasystems\/morse-uploader\/wallet-standard$/,
				replacement: fromHere("../../dist/wallet-standard.js"),
			},
			{
				find: /^@arcadiasystems\/morse-uploader$/,
				replacement: fromHere("../../dist/index.js"),
			},
		],
	},
});
