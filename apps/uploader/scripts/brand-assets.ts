import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Browser, chromium } from "@playwright/test";
import { serveExport } from "../e2e/static-server";

/**
 * Writes the share image and the icon set into public/:
 *
 *   og.png                 the 1200×630 link preview, the built landing
 *                          reframed by og-card.css
 *   icon.svg               the tile: white Trace on ultramarine
 *   favicon.ico            the tile at 16, 32 and 48
 *   icon-192.png, icon-512.png            the tile, for the manifest
 *   apple-touch-icon.png, icon-maskable-512.png
 *                          the tile full-bleed; the device cuts the corners
 *
 * The share image is a screenshot of out/, so build first, and build again
 * afterwards to copy the new files into the export:
 *
 *   bun run build && bun run brand-assets && bun run build
 *
 * Run it after a change to the hero, the lockup, the tiles, the glows or the
 * tokens. Needs Playwright's Chromium, as the e2e tests do.
 */
const APP_ROOT = join(import.meta.dirname, "..");
const PUBLIC = join(APP_ROOT, "public");
const CARD_STYLES = join(import.meta.dirname, "og-card.css");
const CARD = { width: 1200, height: 630 };

const TILE_COLOR = "#2B3BE0";
const TRACE_COLOR = "#FFFFFF";
const TRACE_PATH = "M8 72 V30 H36 V72 H64 V30 H92 V72";
/** The centre of the Trace with its stroke, in the path's 100-unit box. */
const TRACE_CENTRE = { x: 50, y: 51 };
/** The Trace's share of the tile's width, as on the Morse favicon. */
const ROUNDED = { radius: 22, traceScale: 0.64 };
/** Smaller, so the Trace clears the mask iOS and Android cut. */
const FULL_BLEED = { radius: 0, traceScale: 0.58 };

type Tile = typeof ROUNDED;

function tileSvg({ radius, traceScale }: Tile): string {
	const x = 50 - TRACE_CENTRE.x * traceScale;
	const y = 50 - TRACE_CENTRE.y * traceScale;
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
		`<rect width="100" height="100" rx="${radius}" fill="${TILE_COLOR}"/>` +
		`<path d="${TRACE_PATH}" fill="none" stroke="${TRACE_COLOR}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" transform="translate(${x} ${y}) scale(${traceScale})"/>` +
		`</svg>`
	);
}

async function renderTile(
	browser: Browser,
	tile: Tile,
	size: number,
): Promise<Buffer> {
	const page = await browser.newPage({
		viewport: { width: size, height: size },
		deviceScaleFactor: 1,
	});
	try {
		await page.setContent(
			`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${tileSvg(tile)}`,
		);
		return await page.screenshot({ type: "png", omitBackground: true });
	} finally {
		await page.close();
	}
}

/** An .ico holding each PNG as it is, which every current browser reads. */
function icoFrom(images: { size: number; png: Buffer }[]): Buffer {
	const HEADER_BYTES = 6;
	const ENTRY_BYTES = 16;
	const header = Buffer.alloc(HEADER_BYTES + ENTRY_BYTES * images.length);
	header.writeUInt16LE(1, 2); // type: icon
	header.writeUInt16LE(images.length, 4);
	let offset = header.length;
	images.forEach(({ size, png }, index) => {
		const entry = HEADER_BYTES + ENTRY_BYTES * index;
		header.writeUInt8(size, entry); // width
		header.writeUInt8(size, entry + 1); // height
		header.writeUInt16LE(1, entry + 4); // colour planes
		header.writeUInt16LE(32, entry + 6); // bits per pixel
		header.writeUInt32LE(png.length, entry + 8);
		header.writeUInt32LE(offset, entry + 12);
		offset += png.length;
	});
	return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

async function writeIcons(browser: Browser): Promise<void> {
	await writeFile(join(PUBLIC, "icon.svg"), `${tileSvg(ROUNDED)}\n`);
	const pngs: [name: string, tile: Tile, size: number][] = [
		["icon-192.png", ROUNDED, 192],
		["icon-512.png", ROUNDED, 512],
		["icon-maskable-512.png", FULL_BLEED, 512],
		["apple-touch-icon.png", FULL_BLEED, 180],
	];
	for (const [name, tile, size] of pngs)
		await writeFile(join(PUBLIC, name), await renderTile(browser, tile, size));
	const favicon = [];
	for (const size of [16, 32, 48])
		favicon.push({ size, png: await renderTile(browser, ROUNDED, size) });
	await writeFile(join(PUBLIC, "favicon.ico"), icoFrom(favicon));
}

async function writeShareImage(
	browser: Browser,
	origin: string,
): Promise<void> {
	const page = await browser.newPage({
		viewport: CARD,
		deviceScaleFactor: 1,
		reducedMotion: "reduce",
	});
	try {
		await page.goto(origin, { waitUntil: "networkidle" });
		await page.addStyleTag({ path: CARD_STYLES });
		await page.evaluate(async () => {
			await document.fonts.ready;
		});
		// The viewport, not the full page: the glows are fixed to it.
		await page.screenshot({ path: join(PUBLIC, "og.png"), type: "png" });
	} finally {
		await page.close();
	}
}

await access(join(APP_ROOT, "out", "index.html")).catch(() => {
	throw new Error(
		"brand-assets: out/index.html is missing; run `bun run build` first",
	);
});
const server = await serveExport(0);
const browser = await chromium.launch();
try {
	const address = server.address();
	if (address === null || typeof address === "string")
		throw new Error("brand-assets: the static server has no port");
	await writeIcons(browser);
	await writeShareImage(browser, `http://localhost:${address.port}`);
	process.stdout.write(`Wrote the share image and icons to ${PUBLIC}\n`);
} finally {
	await browser.close();
	server.close();
}
