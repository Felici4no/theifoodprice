import type { BrowserObservationInput } from "@/lib/ingestion/browser";
import type { AnalysisResponse } from "./api/client";

/** Messages from the content script to the background service worker. */
export type Request =
  | { type: "capture"; payload: BrowserObservationInput }
  | { type: "openDashboard"; path: string };

export type CaptureResponse =
  | { ok: true; itemId: string; warnings: string[]; analysis: AnalysisResponse }
  | { ok: false; error: string; needsSetup?: boolean };
