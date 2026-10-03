import { MIN_EXTRACTION_CONFIDENCE } from "@/lib/ingestion/browser-contract";

/** What every extractor returns: the value, where it came from, and how sure we are. */
export interface Extracted<T> {
  value: T;
  /** Human-readable description of the selector or strategy that produced the value. */
  selectorUsed: string;
  /** 0–1. Values below MIN_EXTRACTION_CONFIDENCE are never surfaced. */
  confidence: number;
}

/** null = could not be determined confidently. */
export type Extraction<T> = Extracted<T> | null;

export { MIN_EXTRACTION_CONFIDENCE };

/** Applies the confidence floor: low-confidence results become null. */
export function accept<T>(e: Extracted<T> | null | undefined): Extraction<T> {
  if (!e || e.confidence < MIN_EXTRACTION_CONFIDENCE) return null;
  return e;
}
