import { defineConfig } from "tsup";

// ESM-only library build. A second `ui` entry (the default skin + its CSS) is
// added in Phase 5; the core, hooks, and headless primitives ship from `index`.
export default defineConfig({
	entry: {
		index: "src/index.ts",
		"wallet-standard": "src/wallet-standard/index.ts",
	},
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
	treeshake: true,
	splitting: false,
	target: "es2022",
	outDir: "dist",
	// Use React's automatic JSX runtime so .tsx files need no React import.
	esbuildOptions(options) {
		options.jsx = "automatic";
	},
});
