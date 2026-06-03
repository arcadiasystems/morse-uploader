import { defineConfig } from "tsup";

// ESM-only library build. Three entries: the core/hooks/primitives (`index`),
// the optional default skin (`ui`), and the optional wallet helper.
export default defineConfig({
	entry: {
		index: "src/index.ts",
		ui: "src/ui/index.ts",
		"wallet-standard": "src/wallet-standard/index.ts",
	},
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
	treeshake: true,
	// Splitting shares the context/hooks across entries as one chunk, so `.` and
	// `./ui` reference the SAME MorseUploaderContext instance (no provider mismatch).
	splitting: true,
	target: "es2022",
	outDir: "dist",
	// Use React's automatic JSX runtime so .tsx files need no React import.
	esbuildOptions(options) {
		options.jsx = "automatic";
	},
	// The skin stylesheet ships as a separate asset for consumers to import.
	onSuccess: "cp src/ui/styles.css dist/styles.css",
});
