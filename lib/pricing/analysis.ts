import {
  contextFields,
  max,
  mean,
  median,
  min,
  percentile,
  percentileRank,
  priceChangePercentage,
  standardDeviation,
  zScore,
  type Explained,
  type StatContext,
} from "@/lib/statistics";
import { WINDOWS, type WindowKey } from "./windows";

/** Bump when any formula or rule below changes; stored with every PriceAnalysis. */
export const METHODOLOGY_VERSION = "1.0.0";

/** Below this many historical observations, no price label is assigned. */
export const MIN_SAMPLE_FOR_LABEL = 10;
export const LOW_PERCENTILE = 25;
export const HIGH_PERCENTILE = 75;

export interface ObservationPoint {
  id?: string;
  observedAt: Date;
  /** Effective price in cents. */
  effectivePrice: number;
}

export type PriceLabel = "low" | "near" | "high" | "insufficient";

export const PRICE_LABEL_TEXT: Record<PriceLabel, string> = {
  low: "Preço historicamente baixo",
  near: "Preço próximo da mediana",
  high: "Preço historicamente alto",
  insufficient: "Histórico insuficiente",
};

export interface PriceAnalysisResult {
  window: WindowKey;
  methodologyVersion: string;
  computedAt: string;
  /** Latest observation in the window — the "current" price. */
  current: ObservationPoint | null;
  /** Observations strictly before `current` within the window (the reference). */
  historySize: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  median: Explained<number | null>;
  mean: Explained<number | null>;
  stdDev: Explained<number | null>;
  min: Explained<number | null>;
  max: Explained<number | null>;
  p10: Explained<number | null>;
  p25: Explained<number | null>;
  p75: Explained<number | null>;
  p90: Explained<number | null>;
  percentileRank: Explained<number | null>;
  zScore: Explained<number | null>;
  diffFromMedian: Explained<number | null>;
  isNewLow: Explained<boolean | null>;
  label: Explained<PriceLabel>;
}

/**
 * Descriptive analysis of one item over one window.
 * `observations` may contain anything; filtering by window happens here.
 */
export function analyzePrices(
  observations: readonly ObservationPoint[],
  window: WindowKey,
  now: Date,
): PriceAnalysisResult {
  const start = now.getTime() - WINDOWS[window];
  const inWindow = observations
    .filter((o) => {
      const t = o.observedAt.getTime();
      return t > start && t <= now.getTime();
    })
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());

  const current = inWindow.at(-1) ?? null;
  const history = inWindow.slice(0, -1);
  const values = history.map((o) => o.effectivePrice);
  const lastHistory = history.at(-1)?.observedAt;

  const ctx: StatContext = {
    window,
    unit: "cents",
    ...(lastHistory ? { lastUpdatedAt: lastHistory } : {}),
  };

  const med = median(values, ctx);
  const n = values.length;
  const cur = current?.effectivePrice;

  const diffFromMedian =
    cur !== undefined && med.value !== null
      ? priceChangePercentage(cur, med.value, {
          ...ctx,
          name: "Diferença vs mediana",
          description:
            "Quanto o preço atual está acima (positivo) ou abaixo (negativo) da mediana histórica da janela.",
          referenceLabel: "median",
          sampleSize: n,
        })
      : undefinedMetric("Diferença vs mediana", "(current − median) / median × 100", n, ctx);

  const rank =
    cur !== undefined
      ? percentileRank(cur, values, ctx)
      : undefinedMetric("Percentil do preço", "(abaixo + 0,5 × iguais) / n × 100", n, ctx);

  const z =
    cur !== undefined
      ? zScore(cur, values, ctx)
      : undefinedMetric("Z-score", "(x − x̄) / s", n, ctx);

  const histMin = min(values, ctx);

  return {
    window,
    methodologyVersion: METHODOLOGY_VERSION,
    computedAt: now.toISOString(),
    current,
    historySize: n,
    firstObservedAt: inWindow[0]?.observedAt.toISOString() ?? null,
    lastObservedAt: current?.observedAt.toISOString() ?? null,
    median: {
      ...med,
      explanation: { ...med.explanation, name: `Mediana ${window}` },
    },
    mean: mean(values, ctx),
    stdDev: standardDeviation(values, ctx),
    min: histMin,
    max: max(values, ctx),
    p10: percentile(values, 10, ctx),
    p25: percentile(values, 25, ctx),
    p75: percentile(values, 75, ctx),
    p90: percentile(values, 90, ctx),
    percentileRank: rank,
    zScore: z,
    diffFromMedian,
    isNewLow: newLow(cur, histMin.value, n, ctx),
    label: classify(rank.value, n, ctx),
  };
}

function undefinedMetric(
  name: string,
  formula: string,
  n: number,
  ctx: StatContext,
): Explained<null> {
  return {
    value: null,
    explanation: {
      name,
      description: "Sem preço atual na janela.",
      formula,
      variables: {},
      unit: "number",
      sampleSize: n,
      ...contextFields(ctx),
      notes: ["Nenhuma observação na janela selecionada."],
    },
  };
}

function newLow(
  current: number | undefined,
  historicalMin: number | null,
  n: number,
  ctx: StatContext,
): Explained<boolean | null> {
  return {
    value: current === undefined || historicalMin === null ? null : current < historicalMin,
    explanation: {
      name: "Nova mínima histórica",
      description:
        "Verdadeiro quando o preço atual é estritamente menor que todos os preços anteriores da janela.",
      formula: "current < min(histórico)",
      variables: { current: current ?? null, historicalMin },
      variableUnits: { current: "cents", historicalMin: "cents" },
      unit: "number",
      sampleSize: n,
      ...contextFields(ctx),
      notes:
        n < MIN_SAMPLE_FOR_LABEL
          ? [`Com apenas ${n} observações anteriores, "mínima histórica" significa pouco.`]
          : [],
    },
  };
}

export function classify(
  rank: number | null,
  n: number,
  ctx: StatContext = {},
): Explained<PriceLabel> {
  let value: PriceLabel;
  if (rank === null || n < MIN_SAMPLE_FOR_LABEL) value = "insufficient";
  else if (rank <= LOW_PERCENTILE) value = "low";
  else if (rank >= HIGH_PERCENTILE) value = "high";
  else value = "near";
  return {
    value,
    explanation: {
      name: "Classificação do preço",
      description:
        "Rótulo descritivo baseado apenas no percentil do preço atual no histórico. Não é previsão nem garantia.",
      formula: `n < ${MIN_SAMPLE_FOR_LABEL} → insuficiente; percentil ≤ ${LOW_PERCENTILE} → baixo; percentil ≥ ${HIGH_PERCENTILE} → alto; caso contrário → próximo da mediana`,
      variables: { percentileRank: rank, n },
      variableUnits: { percentileRank: "percent", n: "count" },
      unit: "number",
      sampleSize: n,
      ...contextFields(ctx),
      notes: [],
    },
  };
}
