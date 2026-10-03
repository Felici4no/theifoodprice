import { median, type Explained } from "@/lib/statistics";
import { DAY_MS, HOUR_MS } from "./windows";

export interface Gap {
  from: string;
  to: string;
  durationMs: number;
}

export type QualityLevel = "good" | "fair" | "poor" | "none";

export const QUALITY_TEXT: Record<QualityLevel, string> = {
  good: "Boa",
  fair: "Razoável",
  poor: "Fraca",
  none: "Sem dados",
};

export interface DataQualityReport {
  observationCount: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  /** Median time between consecutive observations. */
  medianIntervalMs: Explained<number | null>;
  /** Intervals longer than the gap threshold. */
  gaps: Explained<Gap[]>;
  /** Fraction (0–100) of calendar days in [start, end] with at least one observation. */
  dayCoverage: Explained<number | null>;
  quality: Explained<QualityLevel>;
}

/** Minimum gap size regardless of collection cadence. */
export const MIN_GAP_MS = 6 * HOUR_MS;
export const GAP_MULTIPLIER = 3;

/**
 * Describes how well a set of timestamps covers the period [start, end].
 * All thresholds are explicit and reported in the explanations.
 */
export function assessDataQuality(
  timestamps: readonly Date[],
  start: Date,
  end: Date,
  windowLabel?: string,
): DataQualityReport {
  const ts = timestamps
    .map((d) => d.getTime())
    .filter((t) => t >= start.getTime() && t <= end.getTime())
    .sort((a, b) => a - b);
  const n = ts.length;
  const last = n ? new Date(ts[n - 1]).toISOString() : undefined;
  const ctxBase = {
    ...(windowLabel ? { window: windowLabel } : {}),
    ...(last ? { lastUpdatedAt: last } : {}),
  };

  const intervals: number[] = [];
  for (let i = 1; i < n; i++) intervals.push(ts[i] - ts[i - 1]);
  const medInterval = median(intervals);

  const threshold = Math.max(
    MIN_GAP_MS,
    GAP_MULTIPLIER * (medInterval.value ?? 0),
  );
  // Leading/trailing gaps count too: silence before the first and after the last point.
  const boundaries = n
    ? [start.getTime(), ...ts, end.getTime()]
    : [start.getTime(), end.getTime()];
  const gaps: Gap[] = [];
  for (let i = 1; i < boundaries.length; i++) {
    const d = boundaries[i] - boundaries[i - 1];
    if (d > threshold) {
      gaps.push({
        from: new Date(boundaries[i - 1]).toISOString(),
        to: new Date(boundaries[i]).toISOString(),
        durationMs: d,
      });
    }
  }

  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY_MS));
  const daysWithData = new Set(
    // Clamp so a point exactly at `end` lands in the last day, not an extra one.
    ts.map((t) => Math.min(totalDays - 1, Math.floor((t - start.getTime()) / DAY_MS))),
  ).size;
  const coverage = n ? (daysWithData / totalDays) * 100 : null;

  let level: QualityLevel;
  if (n === 0) level = "none";
  else if (n >= 30 && (coverage ?? 0) >= 70) level = "good";
  else if (n >= 10 && (coverage ?? 0) >= 30) level = "fair";
  else level = "poor";

  return {
    observationCount: n,
    firstObservedAt: n ? new Date(ts[0]).toISOString() : null,
    lastObservedAt: last ?? null,
    medianIntervalMs: {
      value: medInterval.value,
      explanation: {
        ...medInterval.explanation,
        name: "Frequência de coleta",
        description:
          "Intervalo mediano entre duas observações consecutivas. Indica o ritmo típico de coleta.",
        formula: "mediana(tᵢ − tᵢ₋₁)",
        variables: { ...medInterval.explanation.variables, intervals: intervals.length },
        unit: "number",
        sampleSize: n,
        ...ctxBase,
        notes: ["Valor em milissegundos; exibido em formato legível na interface."],
      },
    },
    gaps: {
      value: gaps,
      explanation: {
        name: "Períodos sem dados",
        description:
          "Intervalos sem nenhuma observação maiores que o limiar. Incluem o início e o fim do período.",
        formula: `limiar = max(${MIN_GAP_MS / HOUR_MS}h, ${GAP_MULTIPLIER} × intervalo mediano)`,
        variables: {
          thresholdHours: round(threshold / HOUR_MS, 2),
          medianIntervalHours:
            medInterval.value === null ? null : round(medInterval.value / HOUR_MS, 2),
          gapsFound: gaps.length,
        },
        variableUnits: { gapsFound: "count" },
        unit: "count",
        sampleSize: n,
        ...ctxBase,
      },
    },
    dayCoverage: {
      value: coverage,
      explanation: {
        name: "Cobertura temporal",
        description:
          "Percentual de dias do período com pelo menos uma observação.",
        formula: "dias com dados / dias no período × 100",
        variables: { daysWithData, totalDays },
        variableUnits: { daysWithData: "count", totalDays: "count" },
        unit: "percent",
        sampleSize: n,
        ...ctxBase,
      },
    },
    quality: {
      value: level,
      explanation: {
        name: "Qualidade dos dados",
        description:
          "Classificação por regras simples de volume e cobertura. Não é uma nota estatística.",
        formula:
          "n = 0 → sem dados; n ≥ 30 e cobertura ≥ 70% → boa; n ≥ 10 e cobertura ≥ 30% → razoável; caso contrário → fraca",
        variables: { n, coveragePercent: coverage === null ? null : round(coverage, 1) },
        variableUnits: { n: "count", coveragePercent: "percent" },
        unit: "number",
        sampleSize: n,
        ...ctxBase,
      },
    },
  };
}

function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
