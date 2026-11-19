import type { Metadata, Viewport } from "next";
import {
	Bricolage_Grotesque,
	IBM_Plex_Mono,
	Instrument_Sans,
} from "next/font/google";
import type { ReactNode } from "react";
import "@/styles/base.css";
import {
	SITE_DESCRIPTION,
	SITE_NAME,
	SITE_URL,
	THEME_COLOR,
} from "./site-metadata";

const display = Bricolage_Grotesque({
	subsets: ["latin"],
	axes: ["opsz"],
	variable: "--font-display",
	display: "swap",
});
const sans = Instrument_Sans({
	subsets: ["latin"],
	variable: "--font-sans",
	display: "swap",
});
const mono = IBM_Plex_Mono({
	subsets: ["latin"],
	weight: ["400", "500"],
	variable: "--font-mono",
	display: "swap",
});

export const metadata: Metadata = {
	metadataBase: new URL(SITE_URL),
	title: {
		default: SITE_NAME,
		template: `%s · ${SITE_NAME}`,
	},
	description: SITE_DESCRIPTION,
	applicationName: SITE_NAME,
	// The files in public/, written by scripts/brand-assets.ts.
	icons: {
		icon: [
			{ url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
			{ url: "/icon.svg", type: "image/svg+xml" },
		],
		apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
	},
};

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	themeColor: THEME_COLOR,
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html
			lang="en"
			className={`${display.variable} ${sans.variable} ${mono.variable}`}
		>
			<body>{children}</body>
		</html>
	);
}
