import { defineConfig } from "vitest/config";

// jsdom so component tests (hooks + primitives, from Phase 5 on) get a DOM.
// Coverage thresholds are high on logic and exclude barrels and type-only files.
export default defineConfig({
	test: {
		environment: "jsdom",
		globals: false,
		setupFiles: ["./vitest.setup.ts"],
		include: ["src/**/*.test.{ts,tsx}"],
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov"],
			include: ["src/**/*.{ts,tsx}"],
			exclude: [
				"src/**/*.test.{ts,tsx}",
				"src/**/index.ts",
				"src/**/types.ts",
				// The opinionated skin is the styled assembly of already-tested
				// hooks and primitives; it is smoke-tested, not coverage-gated.
				"src/ui/**",
			],
			thresholds: {
				lines: 90,
				functions: 90,
				branches: 85,
				statements: 90,
			},
		},
	},
});
