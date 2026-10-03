import { contextFields, type Explained, type StatContext } from "./explanation";
import { quantileSorted, sortAscending } from "./quantile";

export interface TimePoint {
  /** Epoch milliseconds. */
  t: number;
  value: number;
}

export interface RollingPoint {
  t: number;
  /** Median of the observations in (t − windowMs, t]. */
  median: number;
  /** Number of observations inside that window. */
  count: number;
}

/**
 * Trailing time-based rolling median: for each observation at time t,
 * the median of all observations with timestamp in (t − windowMs, t].
 * Time-based (not count-based) because collection is irregular.
 */
export function rollingMedian(
  points: readonly TimePoint[],
  windowMs: number,
  ctx?: StatContext & { windowLabel?: string },
): Explained<RollingPoint[]> {
  if (!(windowMs > 0)) throw new RangeError("windowMs must be > 0");
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const result: RollingPoint[] = [];
  let start = 0;
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i].t;
    while (sorted[start].t <= t - windowMs) start++;
    // Include later points with the same timestamp.
    let end = i;
    while (end + 1 < sorted.length && sorted[end + 1].t === t) end++;
    const window = sortAscending(sorted.slice(start, end + 1).map((p) => p.value));
    result.push({ t, median: quantileSorted(window, 0.5).value, count: window.length });
  }
  const label = ctx?.windowLabel ?? `${Math.round(windowMs / 3_600_000)}h`;
  return {
    value: result,
    explanation: {
      name: "Mediana móvel",
      description: `Para cada observação, a mediana de todos os preços coletados nas ${label} anteriores. Suaviza oscilações pontuais.`,
      formula: "m(t) = mediana{ xᵢ : t − janela < tᵢ ≤ t }",
      variables: { rollingWindow: label, points: sorted.length },
      variableUnits: { points: "count" },
      unit: ctx?.unit ?? "number",
      sampleSize: sorted.length,
      ...contextFields(ctx),
      notes: [
        "Pontos com poucas observações na janela (ver count) são menos confiáveis.",
      ],
    },
  };
}
