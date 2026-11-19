import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, sep } from "node:path";

/**
 * Serves the static export in out/ the way vercel.json does: clean URLs, so
 * /app serves app.html. E2E tests run against this, not the dev server, and
 * scripts/brand-assets.ts renders the share image from it.
 */
const ROOT = join(import.meta.dirname, "..", "out");
const PORT = Number(process.env.PORT ?? 4173);
const TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json",
	".txt": "text/plain; charset=utf-8",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
	".wasm": "application/wasm",
	".ico": "image/x-icon",
	".png": "image/png",
	".webmanifest": "application/manifest+json",
};

async function resolveFile(pathname: string): Promise<string | null> {
	const relative = normalize(decodeURIComponent(pathname)).replace(
		/^([/\\])+/,
		"",
	);
	const base = join(ROOT, relative);
	if (base !== ROOT && !base.startsWith(ROOT + sep)) return null;
	const candidates = [base, `${base}.html`, join(base, "index.html")];
	for (const candidate of candidates) {
		const info = await stat(candidate).catch(() => null);
		if (info?.isFile()) return candidate;
	}
	return null;
}

/** Starts the server; port 0 takes any free port. */
export function serveExport(port: number): Promise<Server> {
	const server = createServer(async (request, response) => {
		const { pathname } = new URL(request.url ?? "/", "http://localhost");
		const file = (await resolveFile(pathname)) ?? join(ROOT, "404.html");
		const status =
			file.endsWith(`${sep}404.html`) && pathname !== "/404" ? 404 : 200;
		response.writeHead(status, {
			"content-type": TYPES[extname(file)] ?? "application/octet-stream",
		});
		createReadStream(file).pipe(response);
	});
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, () => resolve(server));
	});
}

if (import.meta.main) {
	await serveExport(PORT);
	process.stdout.write(`Serving ${ROOT} on http://localhost:${PORT}\n`);
}
