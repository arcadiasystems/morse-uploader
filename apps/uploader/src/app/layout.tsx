import type { Metadata, Viewport } from "next";
import {
	Bricolage_Grotesque,
	IBM_Plex_Mono,
	Instrument_Sans,
} from "next/font/google";
import type { ReactNode } from "react";
import "@/styles/base.css";

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
	title: {
		default: "Morse Uploader",
		template: "%s · Morse Uploader",
	},
	description:
		"A non-custodial transfer client for Walrus. Your wallet is the login and signs every transaction.",
	applicationName: "Morse Uploader",
};

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	themeColor: "#F2EFE8",
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
