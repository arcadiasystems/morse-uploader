import type { Metadata } from "next";

/** Where the app is served; relative metadata URLs resolve against it. */
export const SITE_URL = "https://uploader.morsecms.xyz";
export const SITE_NAME = "Morse Uploader";
export const SITE_DESCRIPTION =
	"A non-custodial transfer client for Walrus. Your wallet is the login and signs every transaction.";
/** The field colour, for the browser chrome and the installed app's splash. */
export const THEME_COLOR = "#07080B";

/** public/og.png, rendered from the landing by scripts/brand-assets.ts. */
const SHARE_IMAGE = {
	url: "/og.png",
	width: 1200,
	height: 630,
	type: "image/png",
	alt: "Morse Uploader: Move data to Walrus. Keep every key. Transfer client for Walrus.",
};

type SharePreview = Pick<Metadata, "alternates" | "openGraph" | "twitter">;

/**
 * A page's canonical URL and link preview. Next replaces `openGraph` and
 * `twitter` whole rather than merging them, so every page states all of it.
 */
export function sharePreview({
	title,
	description = SITE_DESCRIPTION,
	path,
}: {
	/** The full title, as the browser tab shows it. */
	title: string;
	description?: string;
	/** The page's clean URL path, as vercel.json serves it. */
	path: string;
}): SharePreview {
	return {
		alternates: { canonical: path },
		openGraph: {
			type: "website",
			siteName: SITE_NAME,
			url: path,
			title,
			description,
			images: [SHARE_IMAGE],
		},
		twitter: {
			card: "summary_large_image",
			site: "@arcadiasysweb3",
			title,
			description,
			images: [SHARE_IMAGE],
		},
	};
}
