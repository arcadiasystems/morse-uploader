"use client";

import dynamic from "next/dynamic";
import { ShellFallback } from "./shell-fallback";

// Wallet discovery runs on window and the Wallet Standard registry, so the
// wallet-aware app renders in the browser only (dApp Kit's Next.js guidance).
const AppRoot = dynamic(
	() => import("@/wallet/app-root").then((module) => module.AppRoot),
	{
		ssr: false,
		loading: ShellFallback,
	},
);

export function UploaderApp() {
	return <AppRoot />;
}
