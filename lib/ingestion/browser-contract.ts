/**
 * Dependency-free constants shared by the backend and the browser extension.
 * Kept separate from browser.ts so the extension bundle does not pull in zod.
 */

/** Below this, a field (or the whole capture) is not trusted. */
export const MIN_EXTRACTION_CONFIDENCE = 0.6;

export const BROWSER_SOURCE = "browser-extension";
