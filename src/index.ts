/**
 * Public entry point for @arcadiasystems/morse-uploader.
 *
 * Phase 0 ships framework-agnostic helpers. The headless hooks, primitives, and
 * the optional default skin (`./ui`) land in later phases. See the README.
 */

export { buildShareUrl } from "./core/build-share-url.js";
export type { BuildShareUrlOptions } from "./types.js";
export { formatBytes } from "./utils/format-bytes.js";
export { resolveOrigin } from "./utils/resolve-origin.js";
