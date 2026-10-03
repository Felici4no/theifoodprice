/**
 * Every number shown to the user travels with its own explanation.
 * The UI renders `explanation` verbatim; it never recomputes a metric.
 */

export type Unit = "cents" | "percent" | "count" | "number" | "zscore";

export type VariableValue = number | string | null;

export interface Explanation {
  /** Human-readable metric name, e.g. "Mediana histórica". */
  name: string;
  /** What the metric means, in plain language. */
  description: string;
  /** Exact formula, written so a person can reproduce it by hand. */
  formula: string;
  /** Actual values plugged into the formula. */
  variables: Record<string, VariableValue>;
  /** Unit of each variable (absent = "number"). */
  variableUnits?: Record<string, Unit>;
  /** Unit of the resulting value. */
  unit: Unit;
  /** Number of observations the metric was computed from. */
  sampleSize: number;
  /** Time window label, e.g. "30d". */
  window?: string;
  /** ISO timestamp of the most recent observation in the sample. */
  lastUpdatedAt?: string;
  /** Caveats: small samples, ties, undefined results… */
  notes?: string[];
}

export interface Explained<T> {
  value: T;
  explanation: Explanation;
}

/** Optional context every statistical function accepts. */
export interface StatContext {
  window?: string;
  lastUpdatedAt?: Date | string;
  /** Unit of the input values (and therefore of most outputs). */
  unit?: Unit;
}

export function contextFields(ctx: StatContext | undefined): {
  window?: string;
  lastUpdatedAt?: string;
} {
  if (!ctx) return {};
  const lastUpdatedAt =
    ctx.lastUpdatedAt instanceof Date
      ? ctx.lastUpdatedAt.toISOString()
      : ctx.lastUpdatedAt;
  return {
    ...(ctx.window !== undefined ? { window: ctx.window } : {}),
    ...(lastUpdatedAt !== undefined ? { lastUpdatedAt } : {}),
  };
}

/** Minimum sample size below which we attach a "small sample" caveat. */
export const SMALL_SAMPLE_THRESHOLD = 10;

export function sampleNotes(n: number): string[] {
  if (n === 0) return ["Sem observações na janela: métrica indefinida."];
  if (n < SMALL_SAMPLE_THRESHOLD)
    return [
      `Amostra pequena (n = ${n}). Trate o resultado como indicativo, não conclusivo.`,
    ];
  return [];
}
