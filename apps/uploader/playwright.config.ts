import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against the static export in out/ (run `bun run build`
 * first), served with clean URLs like Vercel. Wallet tests read live chain
 * state and need E2E_SUI_PRIVATE_KEY; without it they skip and only the
 * layout tests run.
 */
export default defineConfig({
	testDir: "./e2e",
	testMatch: "**/*.spec.ts",
	// Live chain reads: one worker keeps public endpoints from rate limiting.
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? "github" : "list",
	timeout: 90_000,
	expect: { timeout: 20_000 },
	use: {
		baseURL: "http://localhost:4173",
		trace: "retain-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "bun e2e/static-server.ts",
		url: "http://localhost:4173",
		reuseExistingServer: !process.env.CI,
	},
});
