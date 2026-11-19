import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME, THEME_COLOR } from "./site-metadata";

// A static export has no server to answer the request, so prerender it.
export const dynamic = "force-static";

/** The web app manifest, exported as /manifest.webmanifest. */
export default function manifest(): MetadataRoute.Manifest {
	return {
		name: SITE_NAME,
		short_name: "Uploader",
		description: SITE_DESCRIPTION,
		id: "/app",
		start_url: "/app",
		display: "standalone",
		background_color: THEME_COLOR,
		theme_color: THEME_COLOR,
		icons: [
			{ src: "/icon-192.png", sizes: "192x192", type: "image/png" },
			{ src: "/icon-512.png", sizes: "512x512", type: "image/png" },
			{
				src: "/icon-maskable-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "maskable",
			},
		],
	};
}
