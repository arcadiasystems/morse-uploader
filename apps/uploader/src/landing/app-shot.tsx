/**
 * A real screenshot of the app's Overview: the static export, connected to
 * the Testnet test wallet, captured at 1440 × 900 at 2x. Two WebP widths
 * cover phones, 1x desktops and 2x desktops; width and height reserve the
 * box before it loads, so nothing shifts.
 */
const SHOT = {
	srcSet:
		"/landing/app-overview-1200.webp 1200w, /landing/app-overview-2400.webp 2400w",
	src: "/landing/app-overview-1200.webp",
	width: 2400,
	height: 1500,
	// Matches the frame: 20px gutters on phones, 28px up to the 1200px column.
	sizes:
		"(max-width: 860px) calc(100vw - 40px), min(1144px, calc(100vw - 56px))",
	alt: "The Morse Uploader Overview, connected to a Testnet wallet: what it stores, storage paid through, the live WAL price per GiB and epoch, the 12-month expiry timeline, a drop zone, recent activity and its Morse publications.",
} as const;

export function AppShot() {
	return (
		<figure className="shot">
			{/* biome-ignore lint/performance/noImgElement: a static export has no image optimizer; the WebP widths are made ahead of time. */}
			<img
				src={SHOT.src}
				srcSet={SHOT.srcSet}
				sizes={SHOT.sizes}
				width={SHOT.width}
				height={SHOT.height}
				alt={SHOT.alt}
				// Large and partly above the fold at 1440 × 900: fetch it early.
				fetchPriority="high"
				decoding="async"
			/>
		</figure>
	);
}
