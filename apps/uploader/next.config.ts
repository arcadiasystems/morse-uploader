import type { NextConfig } from "next";

// Static export: the app is a client for Walrus with no backend, so every
// route prerenders to plain files in out/ that any static host can serve.
const nextConfig: NextConfig = {
	output: "export",
	reactStrictMode: true,
	turbopack: {
		// The repo root holds the library's own lockfile; pin the app as its own root.
		root: import.meta.dirname,
	},
};

export default nextConfig;
