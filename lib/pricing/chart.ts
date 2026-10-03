import { rollingMedian, type Explanation } from "@/lib/statistics";
import type { PriceAnalysisResult } from "./analysis";
import { DAY_MS, HOUR_MS, WINDOWS, type WindowKey } from "./windows";

export interface ChartPoint {
  t: number;
  price: number;
  rolling: number;
  rollingCount: number;
  promotion: boolean;
}

export interface HistoryChartData {
  start: number;
  end: number;
  points: ChartPoint[];
  reference: {
    median: number | null;
    p25: number | null;
    p75: number | null;
    min: number | null;
    max: number | null;
  };
  /** One explanation per visual element of the chart. */
  legend: {
    observed: Explanation;
    rolling: Explanation;
    median: Explanation;
    band: Explanation;
    min: Explanation;
    max: Explanation;
  };
}

/** Rolling window used for the smoothed line, proportional to the chart period. */
export const ROLLING_WINDOW: Record<WindowKey, { ms: number; label: string }> = {
  "24h": { ms: 3 * HOUR_MS, label: "3h" },
  "7d": { ms: 1 * DAY_MS, label: "24h" },
  "30d": { ms: 3 * DAY_MS, label: "3d" },
  "90d": { ms: 7 * DAY_MS, label: "7d" },
};

/** Pure: prepares everything the history chart draws, with explanations. */
export function buildHistoryChart(
  analysis: PriceAnalysisResult,
  observations: readonly { observedAt: Date; effectivePrice: number; promotionType: string | null }[],
  window: WindowKey,
  now: Date,
): HistoryChartData {
  const start = now.getTime() - WINDOWS[window];
  const inWindow = observations
    .filter((o) => o.observedAt.getTime() > start && o.observedAt.getTime() <= now.getTime())
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());

  const rw = ROLLING_WINDOW[window];
  const rolling = rollingMedian(
    inWindow.map((o) => ({ t: o.observedAt.getTime(), value: o.effectivePrice })),
    rw.ms,
    {
      windowLabel: rw.label,
      window,
      unit: "cents",
      ...(analysis.lastObservedAt ? { lastUpdatedAt: analysis.lastObservedAt } : {}),
    },
  );

  const points: ChartPoint[] = inWindow.map((o, i) => ({
    t: o.observedAt.getTime(),
    price: o.effectivePrice,
    rolling: rolling.value[i].median,
    rollingCount: rolling.value[i].count,
    promotion: o.promotionType !== null,
  }));

  const n = analysis.historySize;
  const common = {
    sampleSize: n,
    window,
    ...(analysis.lastObservedAt ? { lastUpdatedAt: analysis.lastObservedAt } : {}),
  };

  return {
    start,
    end: now.getTime(),
    points,
    reference: {
      median: analysis.median.value,
      p25: analysis.p25.value,
      p75: analysis.p75.value,
      min: analysis.min.value,
      max: analysis.max.value,
    },
    legend: {
      observed: {
        name: "Preços observados",
        description:
          "Cada ponto é uma observação bruta: o preço efetivo (item + taxas − descontos) no momento da coleta. Pontos em destaque tinham alguma promoção.",
        formula: "effectivePrice = currentPrice + deliveryFee + serviceFee − discountValue",
        variables: { pointsInChart: points.length, withPromotion: points.filter((p) => p.promotion).length },
        variableUnits: { pointsInChart: "count", withPromotion: "count" },
        unit: "cents",
        ...common,
        sampleSize: points.length,
        notes: [
          "As linhas de referência usam o histórico anterior à observação mais recente; o gráfico mostra todas, inclusive a mais recente.",
        ],
      },
      rolling: rolling.explanation,
      median: analysis.median.explanation,
      band: {
        name: "Faixa P25–P75",
        description:
          "Intervalo interquartil: metade central dos preços históricos. Preços dentro da faixa são 'normais' para o período.",
        formula: "[P25, P75] com percentis por interpolação linear (tipo 7)",
        variables: {
          p25: analysis.p25.value,
          p75: analysis.p75.value,
          iqr:
            analysis.p25.value !== null && analysis.p75.value !== null
              ? analysis.p75.value - analysis.p25.value
              : null,
        },
        variableUnits: { p25: "cents", p75: "cents", iqr: "cents" },
        unit: "cents",
        ...common,
        notes: analysis.p25.explanation.notes,
      },
      min: analysis.min.explanation,
      max: analysis.max.explanation,
    },
  };
}
